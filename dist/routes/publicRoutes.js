"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicRoutes = void 0;
const express_1 = require("express");
const web_push_1 = __importDefault(require("web-push"));
const eventService_1 = require("../services/eventService");
const chatService_1 = require("../services/chatService");
const pollService_1 = require("../services/pollService");
const arcadeService_1 = require("../services/arcadeService");
const notificationService_1 = require("../services/notificationService");
const emailService_1 = require("../services/emailService");
const analyticsService_1 = require("../services/analyticsService");
const socketManager_1 = require("../sockets/socketManager");
const queueService_1 = require("../services/queueService");
const identityService_1 = require("../services/identityService");
const youtubeChatService_1 = require("../services/youtubeChatService");
const adaptiveAudienceController_1 = require("../services/adaptiveAudienceController");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
// Health Check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        activeVisitors: analyticsService_1.analyticsService.getEffectiveActiveVisitors(),
        queue: queueService_1.queueService.getQueueStats()
    });
});
// Authoritative Public Event Configuration
router.get('/config/public', (req, res) => {
    const config = eventService_1.eventService.getConfig();
    const adminPin = chatService_1.chatService.getAdminPinnedComment();
    const reactions = chatService_1.chatService.getReactions();
    const activePoll = pollService_1.pollService.getActivePoll();
    const effectivePoll = pollService_1.pollService.getEffectivePoll();
    const youtubePoll = youtubeChatService_1.youtubeChatService.getActivePoll();
    const pollFallbackEnabled = adaptiveAudienceController_1.adaptiveAudienceController.isPollFallbackEnabled();
    res.json({
        config,
        adminPinnedComment: adminPin,
        reactions,
        activePoll,
        effectivePoll: effectivePoll.effectivePoll,
        pollSource: effectivePoll.source,
        youtubePoll,
        pollFallbackEnabled,
        activeVisitors: analyticsService_1.analyticsService.getEffectiveActiveVisitors()
    });
});
// Effective Poll (incorporates priority: GameScope poll > YouTube poll fallback)
router.get('/poll/effective', (req, res) => {
    const effective = pollService_1.pollService.getEffectivePoll();
    res.json(effective);
});
/* ---------------- Chat Routes ---------------- */
// Get recent persistent chat messages
router.get('/chat/messages', async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit || '60', 10)));
        const before = req.query.before ? parseInt(req.query.before, 10) : undefined;
        const messages = await chatService_1.chatService.getRecentMessages(limit, before);
        res.json({ messages });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get or allocate permanent GTA-inspired GameScope Identity
router.post('/chat/identity', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'Valid userId is required.' });
        }
        const identity = await identityService_1.identityService.getOrCreateGameScopeIdentity(userId);
        res.json({ success: true, identity });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Post a chat message (Rate limited)
router.post('/chat/messages', (0, rateLimiter_1.rateLimiter)({ windowMs: 10000, max: 10 }), async (req, res) => {
    try {
        const { userId, username, avatarSvg, avatarColor, text, badge } = req.body;
        const message = await chatService_1.chatService.postMessage({
            userId,
            username,
            avatarSvg,
            avatarColor,
            text,
            badge
        });
        await queueService_1.queueService.enqueueChatMessage(message);
        res.status(201).json({ success: true, message });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Like a chat message
router.post('/chat/messages/:id/like', (0, rateLimiter_1.rateLimiter)({ windowMs: 5000, max: 20 }), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID is required.' });
        const result = await chatService_1.chatService.likeMessage(req.params.id, userId);
        res.json({ success: true, ...result });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Get reactions
router.get('/chat/reactions', (req, res) => {
    res.json({ reactions: chatService_1.chatService.getReactions() });
});
// Send reaction
router.post('/chat/reactions', (0, rateLimiter_1.rateLimiter)({ windowMs: 5000, max: 25 }), async (req, res) => {
    try {
        const { type } = req.body;
        const counts = await chatService_1.chatService.recordReaction(type);
        res.json({ success: true, counts });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/* ---------------- Poll Routes ---------------- */
// Get active poll
router.get('/polls/active', (req, res) => {
    res.json({ poll: pollService_1.pollService.getActivePoll() });
});
// Submit vote
router.post('/polls/:id/vote', (0, rateLimiter_1.rateLimiter)({ windowMs: 5000, max: 15 }), async (req, res) => {
    try {
        const { optionId, userId } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID is required.' });
        const updatedPoll = await pollService_1.pollService.submitVote(req.params.id, optionId, userId);
        socketManager_1.socketManager.broadcastPollResults(updatedPoll);
        res.json({ success: true, poll: updatedPoll });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/* ---------------- Arcade Routes ---------------- */
// Start session
router.post('/arcade/session/start', async (req, res) => {
    try {
        const { playerId, playerName } = req.body;
        const result = await arcadeService_1.arcadeService.startSession(playerId || 'guest', playerName || 'Operative');
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Heartbeat
router.post('/arcade/session/heartbeat', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId)
        return res.status(400).json({ ok: false, error: 'Session ID required.' });
    const result = arcadeService_1.arcadeService.heartbeat(sessionId);
    res.json(result);
});
// Submit run score
router.post('/arcade/session/submit', async (req, res) => {
    try {
        const result = await arcadeService_1.arcadeService.submitResult(req.body);
        if (result.ok) {
            const topLeaderboard = await arcadeService_1.arcadeService.getLeaderboard(10);
            socketManager_1.socketManager.broadcastLeaderboardUpdate(topLeaderboard);
        }
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Get leaderboard
router.get('/arcade/leaderboard', async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
        const leaderboard = await arcadeService_1.arcadeService.getLeaderboard(limit);
        res.json({ leaderboard });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- Push Notification Routes ---------------- */
router.get('/notifications/push/public-key', (req, res) => {
    res.json({ publicKey: notificationService_1.notificationService.getVapidPublicKey() });
});
router.post('/notifications/push/subscribe', async (req, res) => {
    try {
        const { endpoint, keys, userId, userAgent, sendConfirmation } = req.body;
        if (!endpoint || !keys) {
            return res.status(400).json({ error: 'Valid subscription endpoint and keys are required.' });
        }
        const record = await notificationService_1.notificationService.subscribe({ endpoint, keys, userId, userAgent });
        // If requested, immediately dispatch a real Web Push alert through FCM to verify native OS delivery
        if (sendConfirmation) {
            try {
                await web_push_1.default.sendNotification({ endpoint, keys }, JSON.stringify({
                    title: 'GameScope Live — Notifications Active!',
                    body: 'Native desktop notifications are now connected. You will receive alerts even when this tab is closed.',
                    icon: '/assets/gta6poster.jpg',
                    badge: '/favicon.svg',
                    tag: 'gamescope-confirmation',
                    url: '/'
                }));
            }
            catch (pushErr) {
                console.warn('[Push] Confirmation push delivery note:', pushErr.message);
            }
        }
        res.status(201).json({ success: true, record });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/notifications/push/unsubscribe', async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint)
            return res.status(400).json({ error: 'Endpoint is required.' });
        await notificationService_1.notificationService.unsubscribe(endpoint);
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/* ---------------- Email Subscription Routes ---------------- */
router.post('/subscriptions/email', (0, rateLimiter_1.rateLimiter)({ windowMs: 60000, max: 10 }), async (req, res) => {
    try {
        const { name, email, source } = req.body;
        const result = await emailService_1.emailService.subscribe({ name, email, source });
        res.status(201).json(result);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/subscriptions/email/unsubscribe', async (req, res) => {
    try {
        const { emailOrToken } = req.body;
        const success = await emailService_1.emailService.unsubscribe(emailOrToken);
        res.json({ success });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/* ---------------- Analytics Heartbeat ---------------- */
router.post('/analytics/ping', (req, res) => {
    const { clientId } = req.body;
    if (clientId) {
        analyticsService_1.analyticsService.recordClientPing(clientId);
    }
    res.json({ ok: true, activeVisitors: analyticsService_1.analyticsService.getEffectiveActiveVisitors() });
});
exports.publicRoutes = router;
