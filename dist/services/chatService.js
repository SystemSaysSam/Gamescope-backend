"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = exports.ChatService = void 0;
const db_1 = require("./db");
const auditService_1 = require("./auditService");
const identityService_1 = require("./identityService");
const socketManager_1 = require("../sockets/socketManager");
class ChatService {
    static instance;
    // In-memory fast cache for user cooldowns & restrictions
    userRestrictions = new Map();
    userMessageHistory = new Map();
    reactionCounts = {
        heart: 482,
        fire: 1254,
        laugh: 310,
        surprised: 184,
        skull: 620,
        clap: 295,
        bolt: 410,
        gamepad: 780
    };
    adminPinnedComment = null;
    chatClearedAt = 0;
    chatGeneration = 1;
    constructor() { }
    static getInstance() {
        if (!ChatService.instance) {
            ChatService.instance = new ChatService();
        }
        return ChatService.instance;
    }
    async init() {
        // Load existing restrictions and admin pin from DB
        const savedPin = await db_1.db.getDoc('site_config', 'admin_pinned_comment');
        if (savedPin) {
            this.adminPinnedComment = savedPin;
        }
        const savedReactions = await db_1.db.getDoc('site_config', 'reaction_counts');
        if (savedReactions) {
            this.reactionCounts = { ...this.reactionCounts, ...savedReactions };
        }
        const savedWipe = await db_1.db.getDoc('site_config', 'chat_wipe_state');
        if (savedWipe) {
            this.chatClearedAt = savedWipe.clearedAt || 0;
            this.chatGeneration = savedWipe.generation || 1;
        }
    }
    getAdminPinnedComment() {
        return this.adminPinnedComment;
    }
    getReactions() {
        return { ...this.reactionCounts };
    }
    async recordReaction(type) {
        if (this.reactionCounts[type] !== undefined) {
            this.reactionCounts[type] += 1;
            await db_1.db.setDoc('site_config', 'reaction_counts', this.reactionCounts);
        }
        return this.getReactions();
    }
    /**
     * Check if a user is currently restricted (timed out or banned)
     */
    checkUserRestriction(userId) {
        const restriction = this.userRestrictions.get(userId);
        if (!restriction)
            return { restricted: false };
        if (restriction.type === 'ban') {
            return { restricted: true, reason: 'You have been blocked from sending messages in this livestream chat.' };
        }
        const now = Date.now();
        if (restriction.expiresAt > now) {
            const secondsRemaining = Math.ceil((restriction.expiresAt - now) / 1000);
            return {
                restricted: true,
                secondsRemaining,
                reason: `You are temporarily timed out. Please wait ${secondsRemaining}s before messaging.`
            };
        }
        // Timeout expired
        this.userRestrictions.delete(userId);
        return { restricted: false };
    }
    /**
     * Validate and Post a new chat message
     */
    async postMessage(params) {
        const userId = params.userId.trim();
        const cleanText = params.text.trim();
        if (!cleanText) {
            throw new Error('Message text cannot be empty.');
        }
        if (cleanText.length > 300) {
            throw new Error('Message exceeds the maximum limit of 300 characters.');
        }
        // 1. Check user restrictions (timeout / stream ban)
        const restCheck = this.checkUserRestriction(userId);
        if (restCheck.restricted) {
            throw new Error(restCheck.reason || 'User is restricted.');
        }
        // 2. Behavioral spam protection & progressive burst cooldown
        const now = Date.now();
        let history = this.userMessageHistory.get(userId);
        if (!history) {
            history = { timestamps: [], lastMessage: '' };
            this.userMessageHistory.set(userId, history);
        }
        // Duplicate message flooding detection
        if (history.lastMessage && history.lastMessage.toLowerCase() === cleanText.toLowerCase()) {
            const recentDuplicates = history.timestamps.filter(t => now - t < 5000);
            if (recentDuplicates.length >= 1) {
                throw new Error('Please avoid sending identical messages repeatedly.');
            }
        }
        // Rate limiting: clean up older than 5 seconds
        history.timestamps = history.timestamps.filter(t => now - t < 5000);
        history.timestamps.push(now);
        history.lastMessage = cleanText;
        if (history.timestamps.length > 4) {
            // Apply progressive timeout for flooding (30 seconds)
            this.applyTimeout(userId, 30, 'system', 'Automated rate limit: message flooding.');
            throw new Error('Slow down! You are sending messages too quickly (30s cooldown applied).');
        }
        // Resolve permanent clean GTA identity for GameScope member
        const identity = await identityService_1.identityService.getOrCreateGameScopeIdentity(userId);
        const finalUsername = params.isAdmin ? (params.username.trim() || 'COMMAND MOD') : identity.displayName;
        const finalAvatar = params.avatarSvg || identity.avatarSvg;
        const finalColor = params.avatarColor || identity.avatarColor;
        const message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            userId,
            username: finalUsername,
            avatarSvg: finalAvatar,
            avatarColor: finalColor,
            text: cleanText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestampMs: now,
            likes: 0,
            isAdmin: Boolean(params.isAdmin),
            badge: params.badge || (params.isAdmin ? 'STAFF' : 'OPERATIVE'),
            source: 'gamescope'
        };
        await db_1.db.setDoc('chat_messages', message.id, message);
        return message;
    }
    getChatClearedAt() {
        return this.chatClearedAt;
    }
    getChatGeneration() {
        return this.chatGeneration;
    }
    /**
     * Admin: Wipe current chat history across active storage and all connected viewports (Requirement 4)
     * Broadcasts chat:cleared and enforces boundary so older messages cannot reappear
     */
    async clearChatHistory(adminInfo) {
        const now = Date.now();
        this.chatClearedAt = now;
        this.chatGeneration += 1;
        const wipeState = {
            clearedAt: now,
            clearedBy: adminInfo.email,
            generation: this.chatGeneration
        };
        await db_1.db.setDoc('site_config', 'chat_wipe_state', wipeState);
        // Delete existing messages prior to clear boundary
        try {
            const allMessages = await db_1.db.getCollection('chat_messages');
            for (const msg of allMessages) {
                if (msg.timestampMs <= now) {
                    await db_1.db.deleteDoc('chat_messages', msg.id);
                }
            }
        }
        catch (err) {
            console.warn('[ChatService] Error cleaning DB chat messages:', err.message);
        }
        // Clear admin pinned comment if it was from cleared messages
        if (this.adminPinnedComment) {
            this.adminPinnedComment = null;
            await db_1.db.deleteDoc('site_config', 'admin_pinned_comment');
            socketManager_1.socketManager.broadcastChatPin(null);
        }
        // Broadcast chat:cleared event to all connected viewports immediately
        socketManager_1.socketManager.broadcast('chat:cleared', wipeState);
        await auditService_1.auditService.logAction({
            adminId: adminInfo.id,
            adminEmail: adminInfo.email,
            action: 'CLEAR_CHAT_HISTORY',
            newValue: wipeState
        });
        console.log(`[ChatService] Chat history cleared by ${adminInfo.email} at ${new Date(now).toISOString()} (Gen: ${this.chatGeneration})`);
        return wipeState;
    }
    /**
     * Get recent messages with pagination, respecting the chat wipe boundary
     */
    async getRecentMessages(limit = 60, beforeTimestamp) {
        const filterFn = (m) => {
            if (m.timestampMs < this.chatClearedAt)
                return false;
            if (beforeTimestamp && m.timestampMs >= beforeTimestamp)
                return false;
            return true;
        };
        return db_1.db.getCollection('chat_messages', filterFn, (a, b) => a.timestampMs - b.timestampMs, limit);
    }
    /**
     * Toggle Like on a message
     */
    async likeMessage(messageId, userId) {
        const msg = await db_1.db.getDoc('chat_messages', messageId);
        if (!msg)
            throw new Error('Message not found.');
        const likeDocId = `${messageId}_${userId}`;
        const existingLike = await db_1.db.getDoc('chat_likes', likeDocId);
        let liked = false;
        let newLikes = msg.likes;
        if (existingLike) {
            // Remove like
            await db_1.db.deleteDoc('chat_likes', likeDocId);
            newLikes = Math.max(0, msg.likes - 1);
            liked = false;
        }
        else {
            // Add like
            await db_1.db.setDoc('chat_likes', likeDocId, { messageId, userId, likedAt: Date.now() });
            newLikes = msg.likes + 1;
            liked = true;
        }
        await db_1.db.updateDoc('chat_messages', messageId, { likes: newLikes });
        return { likes: newLikes, liked };
    }
    /**
     * Admin: Pin / Unpin comment
     */
    async pinMessage(params) {
        let pin;
        if (params.messageId) {
            const msg = await db_1.db.getDoc('chat_messages', params.messageId);
            if (!msg)
                throw new Error('Message not found to pin.');
            pin = {
                id: msg.id,
                username: msg.username,
                text: msg.text,
                likes: msg.likes,
                avatarSvg: msg.avatarSvg,
                avatarColor: msg.avatarColor,
                isAdminPinned: true,
                pinnedAt: Date.now()
            };
        }
        else if (params.customPin) {
            pin = {
                id: `admin-pin-${Date.now()}`,
                username: params.customPin.username || 'GAMESCOPE ADMIN',
                text: params.customPin.text,
                likes: 0,
                avatarSvg: params.customPin.avatarSvg || `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#2d2208"/><path d="M12 2L4 5V11C4 16.5 7.5 21 12 22C16.5 21 20 16.5 20 11V5L12 2Z" fill="#ffaa00"/></svg>`,
                avatarColor: params.customPin.avatarColor || '#ffaa00',
                isAdminPinned: true,
                pinnedAt: Date.now()
            };
        }
        else {
            throw new Error('Either messageId or customPin must be provided.');
        }
        this.adminPinnedComment = pin;
        await db_1.db.setDoc('site_config', 'admin_pinned_comment', pin);
        await auditService_1.auditService.logAction({
            adminId: params.adminInfo.id,
            adminEmail: params.adminInfo.email,
            action: 'PIN_CHAT_MESSAGE',
            resourceId: pin.id,
            newValue: pin
        });
        return pin;
    }
    async unpinMessage(adminInfo) {
        this.adminPinnedComment = null;
        await db_1.db.deleteDoc('site_config', 'admin_pinned_comment');
        await auditService_1.auditService.logAction({
            adminId: adminInfo.id,
            adminEmail: adminInfo.email,
            action: 'UNPIN_CHAT_MESSAGE'
        });
    }
    /**
     * Admin: Delete Message
     */
    async deleteMessage(messageId, adminInfo) {
        const existing = await db_1.db.getDoc('chat_messages', messageId);
        await db_1.db.deleteDoc('chat_messages', messageId);
        // If it was the pinned message, clear pin
        if (this.adminPinnedComment?.id === messageId) {
            await this.unpinMessage(adminInfo);
        }
        await auditService_1.auditService.logAction({
            adminId: adminInfo.id,
            adminEmail: adminInfo.email,
            action: 'DELETE_CHAT_MESSAGE',
            resourceId: messageId,
            previousValue: existing
        });
    }
    /**
     * Admin: Apply User Timeout
     */
    applyTimeout(userId, durationSeconds, appliedBy, reason) {
        const restriction = {
            userId,
            type: 'timeout',
            expiresAt: Date.now() + durationSeconds * 1000,
            reason: reason || `Timed out for ${durationSeconds} seconds.`,
            appliedBy,
            appliedAt: Date.now()
        };
        this.userRestrictions.set(userId, restriction);
        return restriction;
    }
    removeTimeout(userId) {
        this.userRestrictions.delete(userId);
    }
    /**
     * Admin: Ban User from Stream Chat
     */
    banUser(userId, appliedBy, reason) {
        const restriction = {
            userId,
            type: 'ban',
            expiresAt: 0,
            reason: reason || 'Banned from livestream chat.',
            appliedBy,
            appliedAt: Date.now()
        };
        this.userRestrictions.set(userId, restriction);
        return restriction;
    }
    unbanUser(userId) {
        this.userRestrictions.delete(userId);
    }
    getRestrictions() {
        return Array.from(this.userRestrictions.values());
    }
}
exports.ChatService = ChatService;
exports.chatService = ChatService.getInstance();
