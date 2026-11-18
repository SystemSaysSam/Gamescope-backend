"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketManager = exports.SocketManager = void 0;
const socket_io_1 = require("socket.io");
const auth_1 = require("../services/auth");
const eventService_1 = require("../services/eventService");
const chatService_1 = require("../services/chatService");
const pollService_1 = require("../services/pollService");
const analyticsService_1 = require("../services/analyticsService");
const queueService_1 = require("../services/queueService");
const youtubeChatService_1 = require("../services/youtubeChatService");
const adaptiveAudienceController_1 = require("../services/adaptiveAudienceController");
class SocketManager {
    static instance;
    io = null;
    connectedSockets = new Map();
    constructor() { }
    static getInstance() {
        if (!SocketManager.instance) {
            SocketManager.instance = new SocketManager();
        }
        return SocketManager.instance;
    }
    init(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: (origin, callback) => callback(null, true),
                credentials: true,
                methods: ['GET', 'POST', 'OPTIONS']
            },
            allowRequest: (req, callback) => callback(null, true),
            transports: ['websocket', 'polling'],
            pingInterval: 15000,
            pingTimeout: 10000
        });
        // Wire worker queue processor to socket broadcast
        queueService_1.queueService.registerMessageProcessor(async (msg) => {
            // Ensure messages created prior to chat wipe boundary are never broadcast
            if (msg.timestampMs < chatService_1.chatService.getChatClearedAt()) {
                console.log(`[SocketManager] Dropped queued message ${msg.id} created before chat wipe boundary.`);
                return;
            }
            this.io?.emit('chat:message', msg);
        });
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
        console.log('[SocketManager] Socket.IO server initialized.');
        return this.io;
    }
    handleConnection(socket) {
        const socketId = socket.id;
        const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
        let isAdmin = false;
        if (authHeader) {
            try {
                const rawToken = authHeader.replace(/^Bearer\s+/i, '');
                auth_1.authService.verifySessionToken(rawToken);
                isAdmin = true;
            }
            catch {
                isAdmin = false;
            }
        }
        this.connectedSockets.set(socketId, { connectedAt: Date.now(), isAdmin });
        analyticsService_1.analyticsService.updateActiveSocketCount(this.connectedSockets.size);
        socket.join('public');
        if (isAdmin) {
            socket.join('admin');
        }
        // Send Authoritative Initialization State immediately upon connection
        const currentConfig = eventService_1.eventService.getConfig();
        const adminPin = chatService_1.chatService.getAdminPinnedComment();
        const reactions = chatService_1.chatService.getReactions();
        const activePoll = pollService_1.pollService.getActivePoll();
        const effectivePoll = pollService_1.pollService.getEffectivePoll();
        const youtubePoll = youtubeChatService_1.youtubeChatService.getActivePoll();
        const pollFallbackEnabled = adaptiveAudienceController_1.adaptiveAudienceController.isPollFallbackEnabled();
        socket.emit('event:init_state', {
            config: currentConfig,
            adminPinnedComment: adminPin,
            reactions,
            activePoll,
            effectivePoll: effectivePoll.effectivePoll,
            pollSource: effectivePoll.source,
            youtubePoll,
            pollFallbackEnabled,
            chatClearedAt: chatService_1.chatService.getChatClearedAt(),
            chatGeneration: chatService_1.chatService.getChatGeneration(),
            activeVisitors: analyticsService_1.analyticsService.getEffectiveActiveVisitors(),
            serverTimestamp: Date.now()
        });
        // Handle Client Events
        socket.on('analytics:ping', (data) => {
            if (data?.clientId) {
                analyticsService_1.analyticsService.recordClientPing(data.clientId);
            }
        });
        socket.on('chat:send', async (data, ack) => {
            try {
                const message = await chatService_1.chatService.postMessage(data);
                await queueService_1.queueService.enqueueChatMessage(message);
                if (ack)
                    ack({ ok: true, message });
            }
            catch (err) {
                if (ack)
                    ack({ ok: false, error: err.message });
                else
                    socket.emit('chat:error', { error: err.message });
            }
        });
        socket.on('chat:reaction', async (data, ack) => {
            try {
                const updatedReactions = await chatService_1.chatService.recordReaction(data.type);
                this.io?.emit('chat:reaction', { type: data.type, counts: updatedReactions });
                if (ack)
                    ack({ ok: true, counts: updatedReactions });
            }
            catch (err) {
                if (ack)
                    ack({ ok: false, error: err.message });
            }
        });
        socket.on('chat:like', async (data, ack) => {
            try {
                const result = await chatService_1.chatService.likeMessage(data.messageId, data.userId);
                this.io?.emit('chat:like_updated', { messageId: data.messageId, likes: result.likes });
                if (ack)
                    ack({ ok: true, ...result });
            }
            catch (err) {
                if (ack)
                    ack({ ok: false, error: err.message });
            }
        });
        socket.on('poll:vote', async (data, ack) => {
            try {
                const updatedPoll = await pollService_1.pollService.submitVote(data.pollId, data.optionId, data.userId);
                this.io?.emit('poll:results', updatedPoll);
                if (ack)
                    ack({ ok: true, poll: updatedPoll });
            }
            catch (err) {
                if (ack)
                    ack({ ok: false, error: err.message });
            }
        });
        socket.on('disconnect', () => {
            this.connectedSockets.delete(socketId);
            analyticsService_1.analyticsService.updateActiveSocketCount(this.connectedSockets.size);
        });
    }
    /* ---------------- Server-Side Broadcast Helpers ---------------- */
    broadcastEventState(config) {
        this.io?.emit('event:state_updated', {
            state: config.state,
            stateUpdatedAt: config.stateUpdatedAt,
            version: config.version
        });
    }
    broadcastCountdown(config) {
        this.io?.emit('event:countdown_updated', {
            countdown: config.countdown,
            version: config.version
        });
    }
    broadcastStream(config) {
        this.io?.emit('event:stream_updated', {
            youtubeVideoId: config.youtubeVideoId,
            youtubeStreamUrl: config.youtubeStreamUrl,
            version: config.version
        });
    }
    broadcastInactiveScreen(config) {
        this.io?.emit('event:inactive_updated', {
            inactiveScreen: config.inactiveScreen,
            version: config.version
        });
    }
    broadcastForceSync(config) {
        this.io?.emit('event:force_sync', config);
    }
    broadcastChatDelete(messageId) {
        this.io?.emit('chat:message_deleted', { messageId });
    }
    broadcastChatPin(pinnedComment) {
        this.io?.emit('chat:message_pinned', { pinnedComment });
    }
    broadcastPollCreated(poll) {
        this.io?.emit('poll:created', poll);
    }
    broadcastPollResults(poll) {
        this.io?.emit('poll:results', poll);
    }
    broadcastPollClosed(poll) {
        this.io?.emit('poll:closed', poll);
    }
    broadcastPollRemoved() {
        this.io?.emit('poll:removed', {});
    }
    broadcastLeaderboardUpdate(leaderboard) {
        this.io?.emit('arcade:leaderboard_updated', leaderboard);
    }
    broadcastInSiteNotification(notification) {
        this.io?.emit('notification:broadcast', notification);
        return this.connectedSockets.size;
    }
    broadcastReminderStatus(schedule) {
        this.io?.emit('reminder:status_update', { schedule });
    }
    broadcast(event, data) {
        this.io?.emit(event, data);
    }
}
exports.SocketManager = SocketManager;
exports.socketManager = SocketManager.getInstance();
