"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const auth_1 = require("../services/auth");
const eventService_1 = require("../services/eventService");
const chatService_1 = require("../services/chatService");
const pollService_1 = require("../services/pollService");
const arcadeService_1 = require("../services/arcadeService");
const notificationService_1 = require("../services/notificationService");
const reminderScheduler_1 = require("../services/reminderScheduler");
const emailService_1 = require("../services/emailService");
const analyticsService_1 = require("../services/analyticsService");
const auditService_1 = require("../services/auditService");
const socketManager_1 = require("../sockets/socketManager");
const youtubeChatService_1 = require("../services/youtubeChatService");
const adaptiveAudienceController_1 = require("../services/adaptiveAudienceController");
const router = (0, express_1.Router)();
/* ---------------- Authentication ---------------- */
// Admin Login (Public endpoint)
router.post('/auth/login', async (req, res) => {
    try {
        const { firebaseToken, adminSecret, email } = req.body;
        const result = await auth_1.authService.loginAdmin({ firebaseToken, adminSecret, email });
        res.json({ success: true, ...result });
    }
    catch (err) {
        res.status(401).json({ error: err.message });
    }
});
// Protect all following routes
router.use(authMiddleware_1.requireAdmin);
// Verify current session
router.get('/auth/me', (req, res) => {
    res.json({ admin: req.admin });
});
/* ---------------- Event & Stream Control ---------------- */
// Update Event State
router.post('/event/state', async (req, res) => {
    try {
        const { state } = req.body;
        const admin = req.admin;
        const updated = await eventService_1.eventService.updateState(state, { id: admin.adminId, email: admin.email }, req.ip);
        socketManager_1.socketManager.broadcastEventState(updated);
        res.json({ success: true, config: updated });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Update Countdown
router.post('/event/countdown', async (req, res) => {
    try {
        const { targetIso, timezone, label } = req.body;
        const admin = req.admin;
        const updated = await eventService_1.eventService.updateCountdown({
            targetIso,
            timezone,
            label,
            adminInfo: { id: admin.adminId, email: admin.email },
            ip: req.ip
        });
        socketManager_1.socketManager.broadcastCountdown(updated);
        res.json({ success: true, config: updated });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Update Stream URL / Video ID
router.post('/event/stream', async (req, res) => {
    try {
        const { streamUrlOrId, expectedDurationMinutes } = req.body;
        const admin = req.admin;
        const updated = await eventService_1.eventService.updateStream({
            streamUrlOrId,
            expectedDurationMinutes,
            adminInfo: { id: admin.adminId, email: admin.email },
            ip: req.ip
        });
        socketManager_1.socketManager.broadcastStream(updated);
        res.json({ success: true, config: updated });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Update Inactive Screen Content
router.post('/event/inactive-screen', async (req, res) => {
    try {
        const { enabled, heading, description, secondaryMessage } = req.body;
        const admin = req.admin;
        const updated = await eventService_1.eventService.updateInactiveScreen({
            enabled,
            heading,
            description,
            secondaryMessage,
            adminInfo: { id: admin.adminId, email: admin.email },
            ip: req.ip
        });
        socketManager_1.socketManager.broadcastInactiveScreen(updated);
        res.json({ success: true, config: updated });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Force Synchronization
router.post('/event/force-sync', async (req, res) => {
    try {
        const admin = req.admin;
        const updated = await eventService_1.eventService.forceSync({ id: admin.adminId, email: admin.email }, req.ip);
        socketManager_1.socketManager.broadcastForceSync(updated);
        res.json({ success: true, config: updated });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- Chat Moderation ---------------- */
// Pin a message or announcement
router.post('/chat/messages/:id/pin', async (req, res) => {
    try {
        const admin = req.admin;
        const pin = await chatService_1.chatService.pinMessage({
            messageId: req.params.id,
            adminInfo: { id: admin.adminId, email: admin.email }
        });
        socketManager_1.socketManager.broadcastChatPin(pin);
        res.json({ success: true, pin });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Pin custom announcement
router.post('/chat/custom-pin', async (req, res) => {
    try {
        const { username, text, avatarSvg, avatarColor } = req.body;
        const admin = req.admin;
        const pin = await chatService_1.chatService.pinMessage({
            customPin: { username, text, avatarSvg, avatarColor },
            adminInfo: { id: admin.adminId, email: admin.email }
        });
        socketManager_1.socketManager.broadcastChatPin(pin);
        res.json({ success: true, pin });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Unpin message
router.delete('/chat/pin', async (req, res) => {
    try {
        const admin = req.admin;
        await chatService_1.chatService.unpinMessage({ id: admin.adminId, email: admin.email });
        socketManager_1.socketManager.broadcastChatPin(null);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete message
router.delete('/chat/messages/:id', async (req, res) => {
    try {
        const admin = req.admin;
        await chatService_1.chatService.deleteMessage(req.params.id, { id: admin.adminId, email: admin.email });
        socketManager_1.socketManager.broadcastChatDelete(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Apply user timeout
router.post('/chat/users/:userId/timeout', (req, res) => {
    try {
        const { durationSeconds, reason } = req.body;
        const seconds = parseInt(durationSeconds || '60', 10);
        const restriction = chatService_1.chatService.applyTimeout(req.params.userId, seconds, req.admin.email, reason);
        res.json({ success: true, restriction });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Remove user timeout
router.delete('/chat/users/:userId/timeout', (req, res) => {
    chatService_1.chatService.removeTimeout(req.params.userId);
    res.json({ success: true });
});
// Ban user from stream chat
router.post('/chat/users/:userId/ban', (req, res) => {
    try {
        const { reason } = req.body;
        const restriction = chatService_1.chatService.banUser(req.params.userId, req.admin.email, reason);
        res.json({ success: true, restriction });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Unban user
router.delete('/chat/users/:userId/ban', (req, res) => {
    chatService_1.chatService.unbanUser(req.params.userId);
    res.json({ success: true });
});
// Get all active restrictions
router.get('/chat/restrictions', (req, res) => {
    res.json({ restrictions: chatService_1.chatService.getRestrictions() });
});
// Clear current chat history across active storage and viewports (Requirement 4)
router.post('/chat/clear', async (req, res) => {
    try {
        const admin = req.admin;
        const wipeState = await chatService_1.chatService.clearChatHistory({ id: admin.adminId, email: admin.email });
        res.json({
            success: true,
            wipeState: {
                ...wipeState,
                chatClearedAt: wipeState.clearedAt,
                chatGeneration: wipeState.generation
            }
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- Poll Management ---------------- */
// Create Poll
router.post('/polls', async (req, res) => {
    try {
        const { question, options, durationMinutes } = req.body;
        const admin = req.admin;
        const poll = await pollService_1.pollService.createPoll({
            question,
            options,
            durationMinutes,
            adminInfo: { id: admin.adminId, email: admin.email }
        });
        socketManager_1.socketManager.broadcastPollCreated(poll);
        res.status(201).json({ success: true, poll });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Close Poll
router.post('/polls/:id/close', async (req, res) => {
    try {
        const admin = req.admin;
        const poll = await pollService_1.pollService.closePoll(req.params.id, { id: admin.adminId, email: admin.email });
        socketManager_1.socketManager.broadcastPollClosed(poll);
        res.json({ success: true, poll });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Remove Active Poll
router.delete('/polls/active', async (req, res) => {
    try {
        const admin = req.admin;
        const { deleteFromHistory } = req.query;
        await pollService_1.pollService.removePoll({
            deleteFromHistory: deleteFromHistory === 'true',
            adminInfo: { id: admin.adminId, email: admin.email }
        });
        socketManager_1.socketManager.broadcastPollRemoved();
        res.json({ success: true, message: 'Active poll removed successfully.' });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Remove Poll by ID
router.delete('/polls/:id', async (req, res) => {
    try {
        const admin = req.admin;
        const { deleteFromHistory } = req.query;
        await pollService_1.pollService.removePoll({
            pollId: req.params.id,
            deleteFromHistory: deleteFromHistory === 'true',
            adminInfo: { id: admin.adminId, email: admin.email }
        });
        socketManager_1.socketManager.broadcastPollRemoved();
        res.json({ success: true, message: `Poll ${req.params.id} removed successfully.` });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Poll History
router.get('/polls', async (req, res) => {
    try {
        const polls = await pollService_1.pollService.getPollHistory();
        res.json({ polls });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- Arcade Management ---------------- */
// Inspect Sessions
router.get('/arcade/sessions', async (req, res) => {
    try {
        const sessions = await arcadeService_1.arcadeService.getRecentSessions(50);
        res.json({ sessions });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Leaderboard
router.get('/arcade/leaderboard', async (req, res) => {
    try {
        const leaderboard = await arcadeService_1.arcadeService.getLeaderboard(50);
        res.json({ leaderboard });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Invalidate Score
router.delete('/arcade/scores/:id', async (req, res) => {
    try {
        const admin = req.admin;
        await arcadeService_1.arcadeService.invalidateScore(req.params.id, { id: admin.adminId, email: admin.email });
        const updatedLeaderboard = await arcadeService_1.arcadeService.getLeaderboard(10);
        socketManager_1.socketManager.broadcastLeaderboardUpdate(updatedLeaderboard);
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// Reset Leaderboard
router.post('/arcade/reset-leaderboard', async (req, res) => {
    try {
        const admin = req.admin;
        await arcadeService_1.arcadeService.resetLeaderboard({ id: admin.adminId, email: admin.email });
        socketManager_1.socketManager.broadcastLeaderboardUpdate([]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- Notification Management ---------------- */
router.get('/notifications/stats', async (req, res) => {
    try {
        const stats = await notificationService_1.notificationService.getStats();
        const schedule = reminderScheduler_1.reminderScheduler.getSchedule();
        res.json({
            ...stats,
            schedule,
            isReminderScheduled: schedule?.status === 'SCHEDULED',
            scheduledReminderTime: schedule?.scheduledReminderTimeMs || 0
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/notifications/reminder', async (req, res) => {
    try {
        const schedule = reminderScheduler_1.reminderScheduler.getSchedule();
        const history = await reminderScheduler_1.reminderScheduler.getHistory(20);
        const eventConfig = eventService_1.eventService.getConfig();
        res.json({
            schedule,
            history,
            eventConfig
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/notifications/reminder/sync', async (req, res) => {
    try {
        const schedule = await reminderScheduler_1.reminderScheduler.syncWithEventConfig(eventService_1.eventService.getConfig());
        res.json({ success: true, schedule });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/notifications/reminder/trigger-now', async (req, res) => {
    try {
        const schedule = await reminderScheduler_1.reminderScheduler.executeReminderTrigger();
        res.json({ success: true, schedule });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/notifications/broadcast', async (req, res) => {
    try {
        const { title, body, type, url, sendInSite, sendWebPush } = req.body;
        const admin = req.admin;
        const broadcast = await notificationService_1.notificationService.broadcast({
            title,
            body,
            type: type || 'info',
            url,
            sendInSite: Boolean(sendInSite),
            sendWebPush: Boolean(sendWebPush),
            adminInfo: { id: admin.adminId, email: admin.email },
            inSiteDispatcher: (notif) => socketManager_1.socketManager.broadcastInSiteNotification(notif)
        });
        res.status(201).json({ success: true, broadcast });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/notifications/test', async (req, res) => {
    try {
        const stats = await notificationService_1.notificationService.dispatchWebPushBatch({
            title: 'GameScope Live — Test Push Notification',
            body: 'This is an administrative test push alert confirming Web Push delivery.',
            type: 'info'
        });
        res.json({ success: true, stats });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/notifications/history', async (req, res) => {
    try {
        const history = await notificationService_1.notificationService.getBroadcastHistory(50);
        res.json({ history });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- Email Subscriber Management ---------------- */
router.get('/subscriptions/email', async (req, res) => {
    try {
        const search = req.query.search;
        const subscribers = await emailService_1.emailService.getSubscribers(search);
        res.json({ subscribers });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/subscriptions/email/export', async (req, res) => {
    try {
        const csv = await emailService_1.emailService.exportSubscribersCsv();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="gamescope-subscribers.csv"');
        res.send(csv);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/subscriptions/email/:id', async (req, res) => {
    try {
        const admin = req.admin;
        await emailService_1.emailService.removeSubscriber(req.params.id, { id: admin.adminId, email: admin.email });
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/* ---------------- Analytics & Audit Logs ---------------- */
router.get('/analytics', async (req, res) => {
    try {
        const analytics = await analyticsService_1.analyticsService.getAnalytics();
        res.json(analytics);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/analytics/online-count', async (req, res) => {
    try {
        const breakdown = analyticsService_1.analyticsService.getOnlineBreakdown();
        res.json(breakdown);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/analytics/online-count', async (req, res) => {
    try {
        const { forcedCount, reset } = req.body;
        const admin = req.admin;
        const countToSet = reset ? null : (forcedCount !== undefined ? forcedCount : null);
        const breakdown = await analyticsService_1.analyticsService.setForcedOnlineCount(countToSet, admin.email);
        await auditService_1.auditService.logAction({
            adminId: admin.adminId,
            adminEmail: admin.email,
            action: countToSet !== null ? 'FORCE_UPDATE_ONLINE_COUNT' : 'RESET_ONLINE_COUNT_AUTOMATIC',
            newValue: countToSet
        });
        res.json({ success: true, breakdown });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/audit-logs', async (req, res) => {
    try {
        const logs = await auditService_1.auditService.getRecentLogs(100);
        res.json({ logs });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/* ---------------- YouTube Live Chat Integration ---------------- */
router.get('/youtube', async (req, res) => {
    try {
        const config = adaptiveAudienceController_1.adaptiveAudienceController.getConfig();
        const state = youtubeChatService_1.youtubeChatService.getState();
        const metrics = adaptiveAudienceController_1.adaptiveAudienceController.getMetrics();
        const participants = adaptiveAudienceController_1.adaptiveAudienceController.getParticipants();
        const effectivePoll = pollService_1.pollService.getEffectivePoll();
        res.json({ config, state, metrics, participants, effectivePoll });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/youtube/video-id', async (req, res) => {
    try {
        const { videoId } = req.body;
        const admin = req.admin;
        const state = await youtubeChatService_1.youtubeChatService.setVideoId(videoId, admin.email);
        const config = adaptiveAudienceController_1.adaptiveAudienceController.getConfig();
        res.json({ success: true, state, config });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/youtube/poll-stream', async (req, res) => {
    try {
        const { pollVideoId } = req.body;
        const admin = req.admin;
        const state = await youtubeChatService_1.youtubeChatService.setCustomPollVideoId(pollVideoId, admin.email);
        res.json({ success: true, state, activePoll: youtubeChatService_1.youtubeChatService.getActivePoll() });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/youtube/poll-stream/sync', async (req, res) => {
    try {
        const result = await youtubeChatService_1.youtubeChatService.syncCustomPollStream();
        res.json({ success: result.success, poll: result.poll, error: result.error, state: youtubeChatService_1.youtubeChatService.getState() });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/youtube/settings', async (req, res) => {
    try {
        const { importEnabled, pollFallbackEnabled, adaptiveEnabled, minimumCapacity, maximumCapacity, defaultCapacity, manualCapacityOverride, inactivityTimeoutMs, pollingIntervalSeconds, quotaDailyBudget } = req.body;
        const admin = req.admin;
        const updated = await adaptiveAudienceController_1.adaptiveAudienceController.updateConfig({
            ...(importEnabled !== undefined ? { importEnabled: Boolean(importEnabled) } : {}),
            ...(pollFallbackEnabled !== undefined ? { pollFallbackEnabled: Boolean(pollFallbackEnabled) } : {}),
            ...(adaptiveEnabled !== undefined ? { adaptiveEnabled: Boolean(adaptiveEnabled) } : {}),
            ...(typeof minimumCapacity === 'number' ? { minimumCapacity } : {}),
            ...(typeof maximumCapacity === 'number' ? { maximumCapacity } : {}),
            ...(typeof defaultCapacity === 'number' ? { defaultCapacity } : {}),
            ...(typeof inactivityTimeoutMs === 'number' ? { inactivityTimeoutMs } : {}),
            ...(typeof pollingIntervalSeconds === 'number' ? { pollingIntervalSeconds } : {}),
            ...(typeof quotaDailyBudget === 'number' ? { quotaDailyBudget } : {}),
            manualCapacityOverride: manualCapacityOverride === null || manualCapacityOverride === undefined
                ? null
                : Number(manualCapacityOverride)
        }, admin.email);
        // Refresh telemetry intervals in ingestion service
        youtubeChatService_1.youtubeChatService.refreshTelemetryIntervals();
        await auditService_1.auditService.logAction({
            adminId: admin.adminId,
            adminEmail: admin.email,
            action: 'UPDATE_YOUTUBE_CHAT_SETTINGS',
            newValue: updated
        });
        res.json({ success: true, config: updated, state: youtubeChatService_1.youtubeChatService.getState() });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/youtube/reset-quota', async (req, res) => {
    try {
        const admin = req.admin;
        const state = await youtubeChatService_1.youtubeChatService.resetQuotaStatus(admin.email);
        res.json({ success: true, state });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/youtube/reconnect', async (req, res) => {
    try {
        const admin = req.admin;
        const state = await youtubeChatService_1.youtubeChatService.forceReconnect(admin.email);
        res.json({ success: true, state });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/youtube/metrics', async (req, res) => {
    try {
        const metrics = adaptiveAudienceController_1.adaptiveAudienceController.getMetrics();
        const state = youtubeChatService_1.youtubeChatService.getState();
        const participants = adaptiveAudienceController_1.adaptiveAudienceController.getParticipants();
        res.json({ metrics, state, participants });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/youtube/reset-session', async (req, res) => {
    try {
        const admin = req.admin;
        const state = youtubeChatService_1.youtubeChatService.getState();
        adaptiveAudienceController_1.adaptiveAudienceController.startNewStreamSession(state.selectedVideoId);
        await auditService_1.auditService.logAction({
            adminId: admin.adminId,
            adminEmail: admin.email,
            action: 'RESET_YOUTUBE_CHAT_SESSION',
            newValue: state.selectedVideoId
        });
        res.json({ success: true, state: youtubeChatService_1.youtubeChatService.getState() });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.adminRoutes = router;
