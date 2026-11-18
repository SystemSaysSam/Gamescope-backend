import { Router, Request, Response } from 'express';
import webpush from 'web-push';
import { eventService } from '../services/eventService';
import { chatService } from '../services/chatService';
import { pollService } from '../services/pollService';
import { arcadeService } from '../services/arcadeService';
import { notificationService } from '../services/notificationService';
import { emailService } from '../services/emailService';
import { analyticsService } from '../services/analyticsService';
import { socketManager } from '../sockets/socketManager';
import { queueService } from '../services/queueService';
import { identityService } from '../services/identityService';
import { youtubeChatService } from '../services/youtubeChatService';
import { adaptiveAudienceController } from '../services/adaptiveAudienceController';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Health Check
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    activeVisitors: analyticsService.getEffectiveActiveVisitors(),
    queue: queueService.getQueueStats()
  });
});

// Authoritative Public Event Configuration
router.get('/config/public', (req: Request, res: Response) => {
  const config = eventService.getConfig();
  const adminPin = chatService.getAdminPinnedComment();
  const reactions = chatService.getReactions();
  const activePoll = pollService.getActivePoll();
  const effectivePoll = pollService.getEffectivePoll();
  const youtubePoll = youtubeChatService.getActivePoll();
  const pollFallbackEnabled = adaptiveAudienceController.isPollFallbackEnabled();

  res.json({
    config,
    adminPinnedComment: adminPin,
    reactions,
    activePoll,
    effectivePoll: effectivePoll.effectivePoll,
    pollSource: effectivePoll.source,
    youtubePoll,
    pollFallbackEnabled,
    activeVisitors: analyticsService.getEffectiveActiveVisitors()
  });
});

// Effective Poll (incorporates priority: GameScope poll > YouTube poll fallback)
router.get('/poll/effective', (req: Request, res: Response) => {
  const effective = pollService.getEffectivePoll();
  res.json(effective);
});

/* ---------------- Chat Routes ---------------- */

// Get recent persistent chat messages
router.get('/chat/messages', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string || '60', 10)));
    const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
    const messages = await chatService.getRecentMessages(limit, before);
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get or allocate permanent GTA-inspired GameScope Identity
router.post('/chat/identity', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }
    const identity = await identityService.getOrCreateGameScopeIdentity(userId);
    res.json({ success: true, identity });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Post a chat message (Rate limited)
router.post('/chat/messages', rateLimiter({ windowMs: 10000, max: 10 }), async (req: Request, res: Response) => {
  try {
    const { userId, username, avatarSvg, avatarColor, text, badge } = req.body;
    const message = await chatService.postMessage({
      userId,
      username,
      avatarSvg,
      avatarColor,
      text,
      badge
    });

    await queueService.enqueueChatMessage(message);
    res.status(201).json({ success: true, message });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Like a chat message
router.post('/chat/messages/:id/like', rateLimiter({ windowMs: 5000, max: 20 }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });

    const result = await chatService.likeMessage(req.params.id, userId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get reactions
router.get('/chat/reactions', (req: Request, res: Response) => {
  res.json({ reactions: chatService.getReactions() });
});

// Send reaction
router.post('/chat/reactions', rateLimiter({ windowMs: 5000, max: 25 }), async (req: Request, res: Response) => {
  try {
    const { type } = req.body;
    const counts = await chatService.recordReaction(type);
    res.json({ success: true, counts });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- Poll Routes ---------------- */

// Get active poll
router.get('/polls/active', (req: Request, res: Response) => {
  res.json({ poll: pollService.getActivePoll() });
});

// Submit vote
router.post('/polls/:id/vote', rateLimiter({ windowMs: 5000, max: 15 }), async (req: Request, res: Response) => {
  try {
    const { optionId, userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });

    const updatedPoll = await pollService.submitVote(req.params.id, optionId, userId);
    socketManager.broadcastPollResults(updatedPoll);
    res.json({ success: true, poll: updatedPoll });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- Arcade Routes ---------------- */

// Start session
router.post('/arcade/session/start', async (req: Request, res: Response) => {
  try {
    const { playerId, playerName } = req.body;
    const result = await arcadeService.startSession(playerId || 'guest', playerName || 'Operative');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Heartbeat
router.post('/arcade/session/heartbeat', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ ok: false, error: 'Session ID required.' });
  const result = arcadeService.heartbeat(sessionId);
  res.json(result);
});

// Submit run score
router.post('/arcade/session/submit', async (req: Request, res: Response) => {
  try {
    const result = await arcadeService.submitResult(req.body);
    if (result.ok) {
      const topLeaderboard = await arcadeService.getLeaderboard(10);
      socketManager.broadcastLeaderboardUpdate(topLeaderboard);
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get leaderboard
router.get('/arcade/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || '10', 10)));
    const leaderboard = await arcadeService.getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Push Notification Routes ---------------- */

router.get('/notifications/push/public-key', (req: Request, res: Response) => {
  res.json({ publicKey: notificationService.getVapidPublicKey() });
});

router.post('/notifications/push/subscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint, keys, userId, userAgent, sendConfirmation } = req.body;
    if (!endpoint || !keys) {
      return res.status(400).json({ error: 'Valid subscription endpoint and keys are required.' });
    }
    const record = await notificationService.subscribe({ endpoint, keys, userId, userAgent });

    // If requested, immediately dispatch a real Web Push alert through FCM to verify native OS delivery
    if (sendConfirmation) {
      try {
        await webpush.sendNotification(
          { endpoint, keys },
          JSON.stringify({
            title: 'GameScope Live — Notifications Active!',
            body: 'Native desktop notifications are now connected. You will receive alerts even when this tab is closed.',
            icon: '/assets/gta6poster.jpg',
            badge: '/favicon.svg',
            tag: 'gamescope-confirmation',
            url: '/'
          })
        );
      } catch (pushErr: any) {
        console.warn('[Push] Confirmation push delivery note:', pushErr.message);
      }
    }

    res.status(201).json({ success: true, record });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/notifications/push/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint is required.' });
    await notificationService.unsubscribe(endpoint);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- Email Subscription Routes ---------------- */

router.post('/subscriptions/email', rateLimiter({ windowMs: 60000, max: 10 }), async (req: Request, res: Response) => {
  try {
    const { name, email, source } = req.body;
    const result = await emailService.subscribe({ name, email, source });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/subscriptions/email/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { emailOrToken } = req.body;
    const success = await emailService.unsubscribe(emailOrToken);
    res.json({ success });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- Analytics Heartbeat ---------------- */

router.post('/analytics/ping', (req: Request, res: Response) => {
  const { clientId } = req.body;
  if (clientId) {
    analyticsService.recordClientPing(clientId);
  }
  res.json({ ok: true, activeVisitors: analyticsService.getEffectiveActiveVisitors() });
});

export const publicRoutes = router;
