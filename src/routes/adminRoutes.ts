import { Router, Response } from 'express';
import { requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware';
import { authService } from '../services/auth';
import { eventService } from '../services/eventService';
import { chatService } from '../services/chatService';
import { pollService } from '../services/pollService';
import { arcadeService } from '../services/arcadeService';
import { notificationService } from '../services/notificationService';
import { reminderScheduler } from '../services/reminderScheduler';
import { emailService } from '../services/emailService';
import { analyticsService } from '../services/analyticsService';
import { auditService } from '../services/auditService';
import { socketManager } from '../sockets/socketManager';
import { youtubeChatService } from '../services/youtubeChatService';
import { adaptiveAudienceController } from '../services/adaptiveAudienceController';

const router = Router();

/* ---------------- Authentication ---------------- */

// Admin Login (Public endpoint)
router.post('/auth/login', async (req, res: Response) => {
  try {
    const { firebaseToken, adminSecret, email } = req.body;
    const result = await authService.loginAdmin({ firebaseToken, adminSecret, email });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// Protect all following routes
router.use(requireAdmin);

// Verify current session
router.get('/auth/me', (req: AuthenticatedRequest, res: Response) => {
  res.json({ admin: req.admin });
});

/* ---------------- Event & Stream Control ---------------- */

// Update Event State
router.post('/event/state', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { state } = req.body;
    const admin = req.admin!;
    const updated = await eventService.updateState(state, { id: admin.adminId, email: admin.email }, req.ip);
    socketManager.broadcastEventState(updated);
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update Countdown
router.post('/event/countdown', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetIso, timezone, label } = req.body;
    const admin = req.admin!;
    const updated = await eventService.updateCountdown({
      targetIso,
      timezone,
      label,
      adminInfo: { id: admin.adminId, email: admin.email },
      ip: req.ip
    });
    socketManager.broadcastCountdown(updated);
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update Stream URL / Video ID
router.post('/event/stream', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { streamUrlOrId, expectedDurationMinutes } = req.body;
    const admin = req.admin!;
    const updated = await eventService.updateStream({
      streamUrlOrId,
      expectedDurationMinutes,
      adminInfo: { id: admin.adminId, email: admin.email },
      ip: req.ip
    });
    socketManager.broadcastStream(updated);
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update Inactive Screen Content
router.post('/event/inactive-screen', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled, heading, description, secondaryMessage } = req.body;
    const admin = req.admin!;
    const updated = await eventService.updateInactiveScreen({
      enabled,
      heading,
      description,
      secondaryMessage,
      adminInfo: { id: admin.adminId, email: admin.email },
      ip: req.ip
    });
    socketManager.broadcastInactiveScreen(updated);
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Force Synchronization
router.post('/event/force-sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const updated = await eventService.forceSync({ id: admin.adminId, email: admin.email }, req.ip);
    socketManager.broadcastForceSync(updated);
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Chat Moderation ---------------- */

// Pin a message or announcement
router.post('/chat/messages/:id/pin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const pin = await chatService.pinMessage({
      messageId: req.params.id,
      adminInfo: { id: admin.adminId, email: admin.email }
    });
    socketManager.broadcastChatPin(pin);
    res.json({ success: true, pin });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Pin custom announcement
router.post('/chat/custom-pin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, text, avatarSvg, avatarColor } = req.body;
    const admin = req.admin!;
    const pin = await chatService.pinMessage({
      customPin: { username, text, avatarSvg, avatarColor },
      adminInfo: { id: admin.adminId, email: admin.email }
    });
    socketManager.broadcastChatPin(pin);
    res.json({ success: true, pin });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Unpin message
router.delete('/chat/pin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    await chatService.unpinMessage({ id: admin.adminId, email: admin.email });
    socketManager.broadcastChatPin(null);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete message
router.delete('/chat/messages/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    await chatService.deleteMessage(req.params.id, { id: admin.adminId, email: admin.email });
    socketManager.broadcastChatDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Apply user timeout
router.post('/chat/users/:userId/timeout', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { durationSeconds, reason } = req.body;
    const seconds = parseInt(durationSeconds || '60', 10);
    const restriction = chatService.applyTimeout(req.params.userId, seconds, req.admin!.email, reason);
    res.json({ success: true, restriction });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Remove user timeout
router.delete('/chat/users/:userId/timeout', (req: AuthenticatedRequest, res: Response) => {
  chatService.removeTimeout(req.params.userId);
  res.json({ success: true });
});

// Ban user from stream chat
router.post('/chat/users/:userId/ban', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const restriction = chatService.banUser(req.params.userId, req.admin!.email, reason);
    res.json({ success: true, restriction });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Unban user
router.delete('/chat/users/:userId/ban', (req: AuthenticatedRequest, res: Response) => {
  chatService.unbanUser(req.params.userId);
  res.json({ success: true });
});

// Get all active restrictions
router.get('/chat/restrictions', (req: AuthenticatedRequest, res: Response) => {
  res.json({ restrictions: chatService.getRestrictions() });
});

// Clear current chat history across active storage and viewports (Requirement 4)
router.post('/chat/clear', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const wipeState = await chatService.clearChatHistory({ id: admin.adminId, email: admin.email });
    res.json({
      success: true,
      wipeState: {
        ...wipeState,
        chatClearedAt: wipeState.clearedAt,
        chatGeneration: wipeState.generation
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Poll Management ---------------- */

// Create Poll
router.post('/polls', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { question, options, durationMinutes } = req.body;
    const admin = req.admin!;
    const poll = await pollService.createPoll({
      question,
      options,
      durationMinutes,
      adminInfo: { id: admin.adminId, email: admin.email }
    });
    socketManager.broadcastPollCreated(poll);
    res.status(201).json({ success: true, poll });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Close Poll
router.post('/polls/:id/close', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const poll = await pollService.closePoll(req.params.id, { id: admin.adminId, email: admin.email });
    socketManager.broadcastPollClosed(poll);
    res.json({ success: true, poll });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Remove Active Poll
router.delete('/polls/active', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { deleteFromHistory } = req.query;
    await pollService.removePoll({
      deleteFromHistory: deleteFromHistory === 'true',
      adminInfo: { id: admin.adminId, email: admin.email }
    });
    socketManager.broadcastPollRemoved();
    res.json({ success: true, message: 'Active poll removed successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Remove Poll by ID
router.delete('/polls/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { deleteFromHistory } = req.query;
    await pollService.removePoll({
      pollId: req.params.id,
      deleteFromHistory: deleteFromHistory === 'true',
      adminInfo: { id: admin.adminId, email: admin.email }
    });
    socketManager.broadcastPollRemoved();
    res.json({ success: true, message: `Poll ${req.params.id} removed successfully.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Poll History
router.get('/polls', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const polls = await pollService.getPollHistory();
    res.json({ polls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Arcade Management ---------------- */

// Inspect Sessions
router.get('/arcade/sessions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await arcadeService.getRecentSessions(50);
    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard
router.get('/arcade/leaderboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const leaderboard = await arcadeService.getLeaderboard(50);
    res.json({ leaderboard });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Invalidate Score
router.delete('/arcade/scores/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    await arcadeService.invalidateScore(req.params.id, { id: admin.adminId, email: admin.email });
    const updatedLeaderboard = await arcadeService.getLeaderboard(10);
    socketManager.broadcastLeaderboardUpdate(updatedLeaderboard);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reset Leaderboard
router.post('/arcade/reset-leaderboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    await arcadeService.resetLeaderboard({ id: admin.adminId, email: admin.email });
    socketManager.broadcastLeaderboardUpdate([]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Notification Management ---------------- */

router.get('/notifications/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await notificationService.getStats();
    const schedule = reminderScheduler.getSchedule();
    res.json({
      ...stats,
      schedule,
      isReminderScheduled: schedule?.status === 'SCHEDULED',
      scheduledReminderTime: schedule?.scheduledReminderTimeMs || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications/reminder', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schedule = reminderScheduler.getSchedule();
    const history = await reminderScheduler.getHistory(20);
    const eventConfig = eventService.getConfig();
    res.json({
      schedule,
      history,
      eventConfig
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/reminder/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schedule = await reminderScheduler.syncWithEventConfig(eventService.getConfig());
    res.json({ success: true, schedule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/reminder/trigger-now', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schedule = await reminderScheduler.executeReminderTrigger();
    res.json({ success: true, schedule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/broadcast', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, body, type, url, sendInSite, sendWebPush } = req.body;
    const admin = req.admin!;
    const broadcast = await notificationService.broadcast({
      title,
      body,
      type: type || 'info',
      url,
      sendInSite: Boolean(sendInSite),
      sendWebPush: Boolean(sendWebPush),
      adminInfo: { id: admin.adminId, email: admin.email },
      inSiteDispatcher: (notif) => socketManager.broadcastInSiteNotification(notif)
    });
    res.status(201).json({ success: true, broadcast });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/notifications/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await notificationService.dispatchWebPushBatch({
      title: 'GameScope Live — Test Push Notification',
      body: 'This is an administrative test push alert confirming Web Push delivery.',
      type: 'info'
    });
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await notificationService.getBroadcastHistory(50);
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Email Subscriber Management ---------------- */

router.get('/subscriptions/email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    const subscribers = await emailService.getSubscribers(search);
    res.json({ subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subscriptions/email/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const csv = await emailService.exportSubscribersCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="gamescope-subscribers.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/subscriptions/email/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    await emailService.removeSubscriber(req.params.id, { id: admin.adminId, email: admin.email });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- Analytics & Audit Logs ---------------- */

router.get('/analytics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const analytics = await analyticsService.getAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/online-count', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const breakdown = analyticsService.getOnlineBreakdown();
    res.json(breakdown);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/analytics/online-count', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { forcedCount, reset } = req.body;
    const admin = req.admin!;
    const countToSet = reset ? null : (forcedCount !== undefined ? forcedCount : null);
    const breakdown = await analyticsService.setForcedOnlineCount(countToSet, admin.email);

    await auditService.logAction({
      adminId: admin.adminId,
      adminEmail: admin.email,
      action: countToSet !== null ? 'FORCE_UPDATE_ONLINE_COUNT' : 'RESET_ONLINE_COUNT_AUTOMATIC',
      newValue: countToSet
    });

    res.json({ success: true, breakdown });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await auditService.getRecentLogs(100);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- YouTube Live Chat Integration ---------------- */

router.get('/youtube', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = adaptiveAudienceController.getConfig();
    const state = youtubeChatService.getState();
    const metrics = adaptiveAudienceController.getMetrics();
    const participants = adaptiveAudienceController.getParticipants();
    const effectivePoll = pollService.getEffectivePoll();
    res.json({ config, state, metrics, participants, effectivePoll });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/video-id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { videoId } = req.body;
    const admin = req.admin!;
    const state = await youtubeChatService.setVideoId(videoId, admin.email);
    const config = adaptiveAudienceController.getConfig();
    res.json({ success: true, state, config });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/youtube/poll-stream', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pollVideoId } = req.body;
    const admin = req.admin!;
    const state = await youtubeChatService.setCustomPollVideoId(pollVideoId, admin.email);
    res.json({ success: true, state, activePoll: youtubeChatService.getActivePoll() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/youtube/poll-stream/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await youtubeChatService.syncCustomPollStream();
    res.json({ success: result.success, poll: result.poll, error: result.error, state: youtubeChatService.getState() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      importEnabled, 
      pollFallbackEnabled,
      adaptiveEnabled, 
      minimumCapacity, 
      maximumCapacity, 
      defaultCapacity, 
      manualCapacityOverride,
      inactivityTimeoutMs,
      pollingIntervalSeconds,
      quotaDailyBudget
    } = req.body;
    const admin = req.admin!;

    const updated = await adaptiveAudienceController.updateConfig({
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
    youtubeChatService.refreshTelemetryIntervals();

    await auditService.logAction({
      adminId: admin.adminId,
      adminEmail: admin.email,
      action: 'UPDATE_YOUTUBE_CHAT_SETTINGS',
      newValue: updated
    });

    res.json({ success: true, config: updated, state: youtubeChatService.getState() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/youtube/reset-quota', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const state = await youtubeChatService.resetQuotaStatus(admin.email);
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/reconnect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const state = await youtubeChatService.forceReconnect(admin.email);
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/youtube/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = adaptiveAudienceController.getMetrics();
    const state = youtubeChatService.getState();
    const participants = adaptiveAudienceController.getParticipants();
    res.json({ metrics, state, participants });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/reset-session', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const state = youtubeChatService.getState();
    adaptiveAudienceController.startNewStreamSession(state.selectedVideoId);
    
    await auditService.logAction({
      adminId: admin.adminId,
      adminEmail: admin.email,
      action: 'RESET_YOUTUBE_CHAT_SESSION',
      newValue: state.selectedVideoId
    });

    res.json({ success: true, state: youtubeChatService.getState() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export const adminRoutes = router;
