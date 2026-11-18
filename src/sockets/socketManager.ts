import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { authService } from '../services/auth';
import { eventService } from '../services/eventService';
import { chatService } from '../services/chatService';
import { pollService } from '../services/pollService';
import { arcadeService } from '../services/arcadeService';
import { analyticsService } from '../services/analyticsService';
import { queueService } from '../services/queueService';
import { youtubeChatService } from '../services/youtubeChatService';
import { adaptiveAudienceController } from '../services/adaptiveAudienceController';
import { ChatMessage, EventState, LivePoll, PinnedComment, PublicEventConfig, ReactionType } from '../types';

export class SocketManager {
  private static instance: SocketManager;
  private io: Server | null = null;
  private connectedSockets = new Map<string, { connectedAt: number; isAdmin: boolean; userId?: string }>();

  private constructor() {}

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public init(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
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
    queueService.registerMessageProcessor(async (msg: ChatMessage) => {
      // Ensure messages created prior to chat wipe boundary are never broadcast
      if (msg.timestampMs < chatService.getChatClearedAt()) {
        console.log(`[SocketManager] Dropped queued message ${msg.id} created before chat wipe boundary.`);
        return;
      }
      this.io?.emit('chat:message', msg);
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    console.log('[SocketManager] Socket.IO server initialized.');
    return this.io;
  }

  private handleConnection(socket: Socket) {
    const socketId = socket.id;
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    let isAdmin = false;

    if (authHeader) {
      try {
        const rawToken = authHeader.replace(/^Bearer\s+/i, '');
        authService.verifySessionToken(rawToken);
        isAdmin = true;
      } catch {
        isAdmin = false;
      }
    }

    this.connectedSockets.set(socketId, { connectedAt: Date.now(), isAdmin });
    analyticsService.updateActiveSocketCount(this.connectedSockets.size);

    socket.join('public');
    if (isAdmin) {
      socket.join('admin');
    }

    // Send Authoritative Initialization State immediately upon connection
    const currentConfig = eventService.getConfig();
    const adminPin = chatService.getAdminPinnedComment();
    const reactions = chatService.getReactions();
    const activePoll = pollService.getActivePoll();
    const effectivePoll = pollService.getEffectivePoll();
    const youtubePoll = youtubeChatService.getActivePoll();
    const pollFallbackEnabled = adaptiveAudienceController.isPollFallbackEnabled();

    socket.emit('event:init_state', {
      config: currentConfig,
      adminPinnedComment: adminPin,
      reactions,
      activePoll,
      effectivePoll: effectivePoll.effectivePoll,
      pollSource: effectivePoll.source,
      youtubePoll,
      pollFallbackEnabled,
      chatClearedAt: chatService.getChatClearedAt(),
      chatGeneration: chatService.getChatGeneration(),
      activeVisitors: analyticsService.getEffectiveActiveVisitors(),
      serverTimestamp: Date.now()
    });

    // Handle Client Events
    socket.on('analytics:ping', (data: { clientId?: string }) => {
      if (data?.clientId) {
        analyticsService.recordClientPing(data.clientId);
      }
    });

    socket.on('chat:send', async (data: {
      userId: string;
      username: string;
      avatarSvg: string;
      avatarColor: string;
      text: string;
      badge?: string;
    }, ack?: (res: any) => void) => {
      try {
        const message = await chatService.postMessage(data);
        await queueService.enqueueChatMessage(message);
        if (ack) ack({ ok: true, message });
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message });
        else socket.emit('chat:error', { error: err.message });
      }
    });

    socket.on('chat:reaction', async (data: { type: ReactionType }, ack?: (res: any) => void) => {
      try {
        const updatedReactions = await chatService.recordReaction(data.type);
        this.io?.emit('chat:reaction', { type: data.type, counts: updatedReactions });
        if (ack) ack({ ok: true, counts: updatedReactions });
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message });
      }
    });

    socket.on('chat:like', async (data: { messageId: string; userId: string }, ack?: (res: any) => void) => {
      try {
        const result = await chatService.likeMessage(data.messageId, data.userId);
        this.io?.emit('chat:like_updated', { messageId: data.messageId, likes: result.likes });
        if (ack) ack({ ok: true, ...result });
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message });
      }
    });

    socket.on('poll:vote', async (data: { pollId: string; optionId: string | null; userId: string }, ack?: (res: any) => void) => {
      try {
        const updatedPoll = await pollService.submitVote(data.pollId, data.optionId, data.userId);
        this.io?.emit('poll:results', updatedPoll);
        if (ack) ack({ ok: true, poll: updatedPoll });
      } catch (err: any) {
        if (ack) ack({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', () => {
      this.connectedSockets.delete(socketId);
      analyticsService.updateActiveSocketCount(this.connectedSockets.size);
    });
  }

  /* ---------------- Server-Side Broadcast Helpers ---------------- */

  public broadcastEventState(config: PublicEventConfig) {
    this.io?.emit('event:state_updated', {
      state: config.state,
      stateUpdatedAt: config.stateUpdatedAt,
      version: config.version
    });
  }

  public broadcastCountdown(config: PublicEventConfig) {
    this.io?.emit('event:countdown_updated', {
      countdown: config.countdown,
      version: config.version
    });
  }

  public broadcastStream(config: PublicEventConfig) {
    this.io?.emit('event:stream_updated', {
      youtubeVideoId: config.youtubeVideoId,
      youtubeStreamUrl: config.youtubeStreamUrl,
      version: config.version
    });
  }

  public broadcastInactiveScreen(config: PublicEventConfig) {
    this.io?.emit('event:inactive_updated', {
      inactiveScreen: config.inactiveScreen,
      version: config.version
    });
  }

  public broadcastForceSync(config: PublicEventConfig) {
    this.io?.emit('event:force_sync', config);
  }

  public broadcastChatDelete(messageId: string) {
    this.io?.emit('chat:message_deleted', { messageId });
  }

  public broadcastChatPin(pinnedComment: PinnedComment | null) {
    this.io?.emit('chat:message_pinned', { pinnedComment });
  }

  public broadcastPollCreated(poll: LivePoll) {
    this.io?.emit('poll:created', poll);
  }

  public broadcastPollResults(poll: LivePoll) {
    this.io?.emit('poll:results', poll);
  }

  public broadcastPollClosed(poll: LivePoll) {
    this.io?.emit('poll:closed', poll);
  }

  public broadcastPollRemoved() {
    this.io?.emit('poll:removed', {});
  }

  public broadcastLeaderboardUpdate(leaderboard: any[]) {
    this.io?.emit('arcade:leaderboard_updated', leaderboard);
  }

  public broadcastInSiteNotification(notification: { title: string; body: string; type: string; timestamp: number }): number {
    this.io?.emit('notification:broadcast', notification);
    return this.connectedSockets.size;
  }

  public broadcastReminderStatus(schedule: any) {
    this.io?.emit('reminder:status_update', { schedule });
  }

  public broadcast(event: string, data: any) {
    this.io?.emit(event, data);
  }
}

export const socketManager = SocketManager.getInstance();
