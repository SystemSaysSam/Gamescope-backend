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
    constructor() {
        // Background cleaner for stale pings
        setInterval(() => {
            const cutoff = Date.now() - 30000; // 30s timeout
            for (const [id, lastTime] of this.recentPings.entries()) {
                if (lastTime < cutoff) {
                    this.recentPings.delete(id);
                }
            }
        }, 10000);
    }
    static getInstance() {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }
    recordClientPing(clientId) {
        this.recentPings.set(clientId, Date.now());
    }
    updateActiveSocketCount(count) {
        this.activeVisitorsCount = count;
    }
    getEffectiveActiveVisitors() {
        return Math.max(this.activeVisitorsCount, this.recentPings.size);
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
