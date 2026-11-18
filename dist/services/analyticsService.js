"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsService = exports.AnalyticsService = void 0;
const db_1 = require("./db");
const emailService_1 = require("./emailService");
const notificationService_1 = require("./notificationService");
class AnalyticsService {
    static instance;
    startTime = Date.now();
    activeVisitorsCount = 0;
    recentPings = new Map();
    // Forced / Overridden Online Count (Section 1 & 2)
    forcedOnlineCount = null;
    forcedOnlineCountUpdatedAt = null;
    forcedOnlineCountUpdatedBy = null;
    // Decoupled callbacks for admitted YouTube participants and socket broadcasts
    admittedCountGetter = null;
    broadcastNotifier = null;
    lastReportedCount = -1;
    constructor() {
        // Background cleaner for stale pings
        setInterval(() => {
            const cutoff = Date.now() - 30000; // 30s timeout
            let changed = false;
            for (const [id, lastTime] of this.recentPings.entries()) {
                if (lastTime < cutoff) {
                    this.recentPings.delete(id);
                    changed = true;
                }
            }
            if (changed) {
                this.notifyOnlineCountChanged();
            }
        }, 10000);
    }
    static getInstance() {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }
    async init() {
        try {
            const saved = await db_1.db.getDoc('site_config', 'online_count_override');
            if (saved && saved.forcedCount !== undefined && saved.forcedCount !== null) {
                this.forcedOnlineCount = Number(saved.forcedCount);
                this.forcedOnlineCountUpdatedAt = saved.updatedAt || Date.now();
                this.forcedOnlineCountUpdatedBy = saved.updatedBy || 'admin';
                console.log(`[AnalyticsService] Restored forced online count override: ${this.forcedOnlineCount} (set by ${this.forcedOnlineCountUpdatedBy})`);
            }
        }
        catch (err) {
            console.warn('[AnalyticsService] Init warning:', err.message);
        }
    }
    registerAdmittedCountGetter(getter) {
        this.admittedCountGetter = getter;
    }
    registerBroadcastNotifier(notifier) {
        this.broadcastNotifier = notifier;
    }
    recordClientPing(clientId) {
        const isNew = !this.recentPings.has(clientId);
        this.recentPings.set(clientId, Date.now());
        if (isNew) {
            this.notifyOnlineCountChanged();
        }
    }
    updateActiveSocketCount(count) {
        this.activeVisitorsCount = count;
        this.notifyOnlineCountChanged();
    }
    getBaseWebsiteVisitors() {
        return Math.max(this.activeVisitorsCount, this.recentPings.size);
    }
    getAdmittedLiveChatCount() {
        return this.admittedCountGetter ? this.admittedCountGetter() : 0;
    }
    /**
     * Effective Active Visitors:
     * 1. If admin forced count is set (>= 0), return forced count.
     * 2. Otherwise return combined count: Base website visitors (sockets/pings) + Admitted YouTube chat users.
     */
    getEffectiveActiveVisitors() {
        if (this.forcedOnlineCount !== null && this.forcedOnlineCount >= 0) {
            return this.forcedOnlineCount;
        }
        return this.getBaseWebsiteVisitors() + this.getAdmittedLiveChatCount();
    }
    /**
     * Complete Breakdown for Admin Panel telemetry and controls
     */
    getOnlineBreakdown() {
        const baseWebsiteVisitors = this.getBaseWebsiteVisitors();
        const admittedLiveChatUsers = this.getAdmittedLiveChatCount();
        const combinedAutoCount = baseWebsiteVisitors + admittedLiveChatUsers;
        const isForced = this.forcedOnlineCount !== null && this.forcedOnlineCount >= 0;
        const effectiveCount = isForced ? this.forcedOnlineCount : combinedAutoCount;
        return {
            baseWebsiteVisitors,
            admittedLiveChatUsers,
            combinedAutoCount,
            forcedCount: this.forcedOnlineCount,
            isForced,
            effectiveCount,
            updatedAt: this.forcedOnlineCountUpdatedAt || undefined,
            updatedBy: this.forcedOnlineCountUpdatedBy || undefined
        };
    }
    /**
     * Admin: Force Update or Reset Online Audience Count
     */
    async setForcedOnlineCount(count, adminEmail) {
        const validCount = typeof count === 'number' && !isNaN(count) && count >= 0 ? Math.floor(count) : null;
        this.forcedOnlineCount = validCount;
        this.forcedOnlineCountUpdatedAt = validCount !== null ? Date.now() : null;
        this.forcedOnlineCountUpdatedBy = validCount !== null ? adminEmail : null;
        await db_1.db.setDoc('site_config', 'online_count_override', {
            forcedCount: this.forcedOnlineCount,
            updatedAt: this.forcedOnlineCountUpdatedAt,
            updatedBy: this.forcedOnlineCountUpdatedBy
        });
        console.log(`[AnalyticsService] Admin ${adminEmail} ${validCount !== null ? `forced online count to: ${validCount}` : 'reset online count to automatic combined mode'}`);
        const breakdown = this.getOnlineBreakdown();
        this.notifyOnlineCountChanged(true);
        return breakdown;
    }
    notifyOnlineCountChanged(forceEmit = false) {
        const current = this.getEffectiveActiveVisitors();
        if (forceEmit || current !== this.lastReportedCount) {
            this.lastReportedCount = current;
            this.broadcastNotifier?.(current);
        }
    }
    async getAnalytics() {
        const activeVisitors = this.getEffectiveActiveVisitors();
        const [chatMessages, arcadeSessions, emailSubs, pushStats] = await Promise.all([
            db_1.db.getCollection('chat_messages'),
            db_1.db.getCollection('arcade_sessions'),
            emailService_1.emailService.getSubscribers(),
            notificationService_1.notificationService.getStats()
        ]);
        const uniqueChatters = new Set(chatMessages.map(m => m.userId)).size;
        const uniqueArcadePlayers = new Set(arcadeSessions.map(s => s.playerId)).size;
        return {
            activeVisitors,
            chatParticipants: uniqueChatters,
            arcadePlayers: uniqueArcadePlayers,
            totalSubscribers: emailSubs.length,
            totalPushSubscribers: pushStats.activeSubscriptions,
            youtubeLiveViewers: null, // Clearly un-fabricated
            youtubeViewerNote: 'Direct YouTube livestream viewer metrics require authorized YouTube Data API credentials. Website visitors are measured independently.',
            totalMessagesSent: chatMessages.length,
            totalArcadeGamesPlayed: arcadeSessions.length,
            serverUptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
        };
    }
}
exports.AnalyticsService = AnalyticsService;
exports.analyticsService = AnalyticsService.getInstance();
