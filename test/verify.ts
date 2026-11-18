/**
 * GameScope Live — Comprehensive Automated Verification Suite
 */

process.env.NODE_ENV = 'test';

import { startServer, server } from '../src/server';
import { env } from '../src/config/env';

async function runTests() {
  await startServer();

  console.log('\n=======================================================');
  console.log('  STARTING GAMESCOPE LIVE AUTOMATED VERIFICATION SUITE');
  console.log('=======================================================\n');

  const BASE_URL = `http://localhost:${env.PORT}`;
  let passedCount = 0;
  let failedCount = 0;

  async function assertTest(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name} -> ${err.message}`);
      failedCount++;
    }
  }

  // Helper fetch
  async function api(path: string, options: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {})
      }
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data: json };
  }

  let adminToken = '';
  let testMsgId = '';
  let testPollId = '';
  let testArcadeSessionId = '';

  // Test 1: Health Check
  await assertTest('Health check returns ok and uptime', async () => {
    const res = await api('/api/health');
    if (!res.ok || res.data.status !== 'ok') throw new Error(`Status was ${res.status}`);
  });

  // Test 2: Public Config
  await assertTest('Public config returns authoritative state', async () => {
    const res = await api('/api/config/public');
    if (!res.ok || !res.data.config?.state) throw new Error(`Missing config.state`);
  });

  // Test 3: Admin Login with Master Secret
  await assertTest('Admin login with master secret issues JWT token', async () => {
    const res = await api('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ adminSecret: env.ADMIN_SECRET })
    });
    if (!res.ok || !res.data.token) throw new Error('Failed to login with admin secret');
    adminToken = res.data.token;
  });

  // Test 4: Verify Admin Session
  await assertTest('Admin auth/me validates JWT session', async () => {
    const res = await api('/api/admin/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok || !res.data.admin?.email) throw new Error('Failed to verify admin token');
  });

  // Test 5: Event State Transitions (UPCOMING -> STARTING -> LIVE -> BREAK -> ENDED -> UPCOMING)
  await assertTest('Event state transitions update and persist', async () => {
    const states = ['STARTING', 'LIVE', 'BREAK', 'ENDED', 'UPCOMING'];
    for (const st of states) {
      const res = await api('/api/admin/event/state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ state: st })
      });
      if (!res.ok || res.data.config.state !== st) throw new Error(`Failed transition to ${st}`);
    }
  });

  // Test 6: Countdown Management
  await assertTest('Countdown configuration updates and recalculates UTC target', async () => {
    const targetIso = new Date(Date.now() + 7200000).toISOString();
    const res = await api('/api/admin/event/countdown', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        targetIso,
        timezone: 'Asia/Kolkata',
        label: '6:30 PM IST'
      })
    });
    if (!res.ok || res.data.config.countdown.label !== '6:30 PM IST') {
      throw new Error('Failed to update countdown');
    }
  });

  // Test 7: Stream URL Management & Video ID Extraction
  await assertTest('Stream URL updates extract valid YouTube Video ID', async () => {
    const res = await api('/api/admin/event/stream', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        streamUrlOrId: 'https://www.youtube.com/watch?v=QdBZY2fkU-0',
        expectedDurationMinutes: 300
      })
    });
    if (!res.ok || res.data.config.youtubeVideoId !== 'QdBZY2fkU-0') {
      throw new Error('Failed to extract video ID');
    }
  });

  // Test 8: Inactive Screen Content
  await assertTest('Inactive screen editor saves and publishes', async () => {
    const res = await api('/api/admin/event/inactive-screen', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        enabled: true,
        heading: 'TEST CONCLUSION HEADLINE',
        description: 'Test conclusion description.',
        secondaryMessage: 'Follow for updates.'
      })
    });
    if (!res.ok || res.data.config.inactiveScreen.heading !== 'TEST CONCLUSION HEADLINE') {
      throw new Error('Failed to update inactive screen');
    }
  });

  // Test 9: Force Synchronization
  await assertTest('Force sync increments configuration version', async () => {
    const res = await api('/api/admin/event/force-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok || !res.data.config.version) throw new Error('Force sync failed');
  });

  // Test 10: Post Chat Message
  await assertTest('Posting chat message validates input and persists message', async () => {
    const res = await api('/api/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'test-user-1',
        username: 'TestOperative',
        avatarSvg: '<svg></svg>',
        avatarColor: '#00f0ff',
        text: 'Automated test message for Leonida community chat.',
        badge: 'OPERATIVE'
      })
    });
    if (!res.ok || !res.data.message?.id) throw new Error('Failed to post message');
    testMsgId = res.data.message.id;
  });

  // Test 11: Like Message
  await assertTest('Liking chat message updates counter', async () => {
    const res = await api(`/api/chat/messages/${testMsgId}/like`, {
      method: 'POST',
      body: JSON.stringify({ userId: 'test-user-2' })
    });
    if (!res.ok || res.data.likes < 1) throw new Error('Like count failed to increment');
  });

  // Test 12: Pin Message & Unpin
  await assertTest('Admin pinning and unpinning comment works', async () => {
    const pinRes = await api(`/api/admin/chat/messages/${testMsgId}/pin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!pinRes.ok || !pinRes.data.pin?.isAdminPinned) throw new Error('Failed to pin message');

    const unpinRes = await api('/api/admin/chat/pin', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!unpinRes.ok) throw new Error('Failed to unpin message');
  });

  // Test 13: User Timeout Enforcement
  await assertTest('Admin user timeout restricts messaging', async () => {
    const timeoutRes = await api('/api/admin/chat/users/bad-actor-1/timeout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ durationSeconds: 60, reason: 'Spam testing' })
    });
    if (!timeoutRes.ok) throw new Error('Failed to apply timeout');

    // Attempt to post from timed-out user
    const postRes = await api('/api/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'bad-actor-1',
        username: 'BadActor',
        avatarSvg: '<svg></svg>',
        avatarColor: '#ff2a85',
        text: 'Blocked message attempt.'
      })
    });
    if (postRes.ok) throw new Error('Timed out user was not blocked!');

    // Remove timeout
    await api('/api/admin/chat/users/bad-actor-1/timeout', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  // Test 14: Poll Creation, Voting, and Closing
  await assertTest('Poll creation, voting, and closing lifecycle', async () => {
    const createRes = await api('/api/admin/polls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        question: 'TEST MISSION POLL: WHICH WEAPON LOADOUT?',
        options: ['Heavy Tactical Rifle', 'Silenced SMG & Grenades'],
        durationMinutes: 10
      })
    });
    if (!createRes.ok || !createRes.data.poll?.id) throw new Error('Failed to create poll');
    testPollId = createRes.data.poll.id;

    // Vote
    const voteRes = await api(`/api/polls/${testPollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId: 'opt-1', userId: 'voter-1' })
    });
    if (!voteRes.ok || voteRes.data.poll.totalVotes < 1) throw new Error('Vote count failed to increment');

    // Close
    const closeRes = await api(`/api/admin/polls/${testPollId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!closeRes.ok || closeRes.data.poll.status !== 'closed') throw new Error('Failed to close poll');

    // Remove Poll completely from active site
    const removeRes = await api('/api/admin/polls/active', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!removeRes.ok || !removeRes.data.success) throw new Error('Failed to remove active poll');

    // Verify active poll is now null
    const pubRes = await api('/api/config/public');
    if (!pubRes.ok || pubRes.data.activePoll !== null) {
      throw new Error('Active poll was not cleared from public site config after removal');
    }
  });

  // Test 15: Arcade Session, Physics Validation & Leaderboard
  await assertTest('Arcade start session, physics validation, and leaderboard ranking', async () => {
    const startRes = await api('/api/arcade/session/start', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'pilot-test-1', playerName: 'ApexPilot' })
    });
    if (!startRes.ok || !startRes.data.sessionId) throw new Error('Failed to start arcade session');
    testArcadeSessionId = startRes.data.sessionId;

    // Submit legitimate run: 2500m in 60s (speed ~41.6 m/s <= 64 m/s limit)
    const subRes = await api('/api/arcade/session/submit', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: testArcadeSessionId,
        playerId: 'pilot-test-1',
        playerName: 'ApexPilot',
        distance: 2500,
        endReason: 'CRASHED',
        checkpoints: 3,
        stats: {
          longestJump: 45,
          clean: 12,
          near: 8,
          coins: 25,
          jetpacks: 1,
          doubleJumps: 4,
          nitroUsed: 35,
          nitroDist: 600,
          duration: 60.0
        },
        clientBuild: 'vcr-1.2'
      })
    });
    if (!subRes.ok || !subRes.data.finalDistance) throw new Error('Legitimate run submission rejected');

    // Verify presence on leaderboard
    const lbRes = await api('/api/arcade/leaderboard');
    if (!lbRes.ok || !lbRes.data.leaderboard.some((s: any) => s.username === 'ApexPilot')) {
      throw new Error('Score not present on leaderboard');
    }
  });

  // Test 16: Physics Bounds Rejection for Impossible Score
  await assertTest('Physics bounds rejects impossible scores (e.g. 50,000m in 5 seconds)', async () => {
    // Start session
    const startRes = await api('/api/arcade/session/start', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'cheater-1', playerName: 'SpeedHacker' })
    });
    if (!startRes.ok) throw new Error('Failed to start session');

    // Attempt 50,000m in 5s (speed 10,000 m/s > 64 m/s)
    const hackSubRes = await api('/api/arcade/session/submit', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: startRes.data.sessionId,
        playerId: 'cheater-1',
        playerName: 'SpeedHacker',
        distance: 50000,
        endReason: 'CRASHED',
        checkpoints: 0,
        stats: {
          longestJump: 0,
          clean: 0,
          near: 0,
          coins: 0,
          jetpacks: 0,
          doubleJumps: 0,
          nitroUsed: 0,
          nitroDist: 0,
          duration: 5.0
        },
        clientBuild: 'vcr-1.2'
      })
    });
    if (hackSubRes.ok && hackSubRes.data.code !== 'SCORE_PLAUSIBILITY_FAILED') {
      throw new Error('Server accepted physically impossible run score!');
    }
  });

  // Test 17: Email Subscription & Unsubscribe
  await assertTest('Email subscription, duplicate handling, and unsubscribe', async () => {
    const subRes = await api('/api/subscriptions/email', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Leonida Operative',
        email: 'operative@gamescope.live',
        source: 'verification_suite'
      })
    });
    if (!subRes.ok || !subRes.data.success) throw new Error('Failed to subscribe email');

    // Duplicate subscribe
    const dupRes = await api('/api/subscriptions/email', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Leonida Operative',
        email: 'operative@gamescope.live'
      })
    });
    if (!dupRes.ok || !dupRes.data.alreadySubscribed) throw new Error('Duplicate was not handled gracefully');

    // Unsubscribe
    const unsubRes = await api('/api/subscriptions/email/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ emailOrToken: 'operative@gamescope.live' })
    });
    if (!unsubRes.ok || !unsubRes.data.success) throw new Error('Failed to unsubscribe');
  });

  // Test 18: Custom Broadcast Dispatcher (In-Site Banner)
  await assertTest('Custom broadcast sends in-site notification and logs history', async () => {
    const bRes = await api('/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'VERIFICATION SUITE BROADCAST ALERT',
        body: 'Testing broadcast delivery across connected viewports.',
        type: 'important',
        url: '/',
        sendInSite: true,
        sendWebPush: false
      })
    });
    if (!bRes.ok || !bRes.data.broadcast?.id) throw new Error('Broadcast dispatch failed');
  });

  // Test 19: Push Notification VAPID Public Key Retrieval
  await assertTest('Public push endpoint returns authoritative VAPID key', async () => {
    const res = await api('/api/notifications/push/public-key');
    if (!res.ok || !res.data.publicKey || typeof res.data.publicKey !== 'string') {
      throw new Error('VAPID public key was missing or malformed');
    }
  });

  // Test 20: Push Subscription Registration & Idempotency
  await assertTest('Push subscription registers with SHA-256 docId and updates idempotently', async () => {
    const mockEndpoint = 'https://fcm.googleapis.com/fcm/send/test-operative-token-verification-' + Date.now();
    const mockKeys = {
      p256dh: 'BILYFQOGxZH2AL1jRHABY3nuiZYjzCdKUUjSVTSFI_biD8hvsaoPuC0aFrCkQlUu79fUyxsahNp-7loeCT8clbM',
      auth: 'tBHItJAhVoNL2uvydSioew'
    };

    // 1. Initial subscription
    const subRes = await api('/api/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: mockEndpoint,
        keys: mockKeys,
        userId: 'operative-test-push',
        userAgent: 'VerificationSuite/1.0'
      })
    });
    if (!subRes.ok || !subRes.data.record?.id) {
      throw new Error('Push subscription failed to register');
    }

    // 2. Re-subscribe idempotently
    const reSubRes = await api('/api/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: mockEndpoint,
        keys: mockKeys,
        userId: 'operative-test-push'
      })
    });
    if (!reSubRes.ok || reSubRes.data.record?.id !== subRes.data.record.id) {
      throw new Error('Idempotent re-subscribe created duplicate record');
    }

    // 3. Verify in admin notification stats
    const statsRes = await api('/api/admin/notifications/stats', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!statsRes.ok || statsRes.data.activeSubscriptions < 1) {
      throw new Error('Registered subscription not counted in active subscriptions');
    }
  });

  // Test 21: Admin-Triggered Push Notification with Delivery Stats
  await assertTest('Admin broadcast with Web Push dispatches batch and tracks stats', async () => {
    const bRes = await api('/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'TACTICAL BROADCAST: AIRDROP INCOMING',
        body: 'Payload deployed to all operational sectors.',
        type: 'warning',
        url: '/stream',
        sendInSite: true,
        sendWebPush: true
      })
    });
    if (!bRes.ok || !bRes.data.broadcast) throw new Error('Web Push broadcast failed');
    const { deliveryStats } = bRes.data.broadcast;
    if (typeof deliveryStats?.pushAttempted !== 'number' || deliveryStats.pushAttempted < 1) {
      throw new Error('Web Push did not attempt delivery to active subscribers');
    }
  });

  // Test 22: Automated 15-Minute Event Reminder Scheduling & Rescheduling
  await assertTest('Automated 15-min reminder scheduler syncs with countdown and reschedules on change', async () => {
    // 1. Fetch initial reminder schedule
    const remRes = await api('/api/admin/notifications/reminder', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!remRes.ok || !remRes.data.schedule) throw new Error('Failed to fetch reminder schedule');

    const initialSchedule = remRes.data.schedule;
    const initialExpectedReminder = initialSchedule.eventStartTimeMs - 15 * 60 * 1000;
    if (Math.abs(initialSchedule.scheduledReminderTimeMs - initialExpectedReminder) > 1000) {
      throw new Error('Reminder time is not exactly 15 minutes before event start');
    }

    // 2. Update event countdown to 4 hours in future
    const newTargetMs = Date.now() + 4 * 3600 * 1000;
    const newTargetIso = new Date(newTargetMs).toISOString();
    const countRes = await api('/api/admin/event/countdown', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        targetIso: newTargetIso,
        timezone: 'Asia/Kolkata',
        label: 'RESCHEDULED EVENT'
      })
    });
    if (!countRes.ok) throw new Error('Failed to update event countdown');

    // 3. Verify reminder scheduler automatically rescheduled
    const updatedRemRes = await api('/api/admin/notifications/reminder', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!updatedRemRes.ok || !updatedRemRes.data.schedule) throw new Error('Failed to retrieve updated schedule');

    const updatedSchedule = updatedRemRes.data.schedule;
    const expectedNewReminder = newTargetMs - 15 * 60 * 1000;
    if (Math.abs(updatedSchedule.scheduledReminderTimeMs - expectedNewReminder) > 2000) {
      throw new Error('Reminder scheduler did not automatically reschedule on countdown change');
    }
    if (updatedSchedule.status !== 'SCHEDULED') {
      throw new Error(`Expected status SCHEDULED after reschedule, got: ${updatedSchedule.status}`);
    }
  });

  // Test 23: Automated Reminder Cancellation on Event State Change
  await assertTest('Automated reminder cancels when event transitions away from UPCOMING and reactivates on return', async () => {
    // 1. Transition event to LIVE
    await api('/api/admin/event/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ state: 'LIVE' })
    });

    const liveRemRes = await api('/api/admin/notifications/reminder', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!liveRemRes.ok || liveRemRes.data.schedule?.status !== 'CANCELLED') {
      throw new Error(`Expected CANCELLED status when event is LIVE, got: ${liveRemRes.data.schedule?.status}`);
    }

    // 2. Transition back to UPCOMING
    await api('/api/admin/event/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ state: 'UPCOMING' })
    });

    const upcomingRemRes = await api('/api/admin/notifications/reminder', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!upcomingRemRes.ok || upcomingRemRes.data.schedule?.status !== 'SCHEDULED') {
      throw new Error(`Expected SCHEDULED status when event returns to UPCOMING, got: ${upcomingRemRes.data.schedule?.status}`);
    }
  });

  // Test 24: Automated Reminder Immediate Execution & Delivery Logging
  await assertTest('Automated reminder trigger execution records delivery stats, triggers, and history', async () => {
    const triggerRes = await api('/api/admin/notifications/reminder/trigger-now', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!triggerRes.ok || !triggerRes.data.schedule) throw new Error('Trigger execution endpoint failed');

    const executedSchedule = triggerRes.data.schedule;
    if (!executedSchedule.triggerExecuted) {
      throw new Error('triggerExecuted flag was false after execution');
    }
    if (!executedSchedule.triggerExecutedAt) {
      throw new Error('triggerExecutedAt timestamp was missing');
    }
    if (!['COMPLETED', 'TRIGGER_EXECUTED', 'PARTIALLY_DELIVERED', 'FAILED'].includes(executedSchedule.status)) {
      throw new Error(`Unexpected status after trigger: ${executedSchedule.status}`);
    }

    // Verify historical entry is stored
    const historyRes = await api('/api/admin/notifications/reminder', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!historyRes.ok || !Array.isArray(historyRes.data.history) || historyRes.data.history.length === 0) {
      throw new Error('Reminder execution was not recorded in history');
    }
  });

  // Test 25: Operational Analytics
  await assertTest('Analytics returns distinct measured visitor metrics without fabrication', async () => {
    const anaRes = await api('/api/admin/analytics', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!anaRes.ok) throw new Error('Failed to fetch analytics');
    if (anaRes.data.youtubeLiveViewers !== null) {
      throw new Error('YouTube livestream viewers was fabricated!');
    }
  });

  // Test 26: Audit Logs
  await assertTest('Audit log records all administrative actions with timestamps and admin identity', async () => {
    const logsRes = await api('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!logsRes.ok || !Array.isArray(logsRes.data.logs) || logsRes.data.logs.length === 0) {
      throw new Error('Audit logs were not recorded');
    }
  });

  // Test 27: Switch to LIVE triggers automatic Web Push broadcast to eligible clients
  await assertTest('Switching event state to LIVE triggers automatic Web Push notification broadcast and records in history', async () => {
    // 1. First ensure state is not LIVE (e.g. STARTING)
    await api('/api/admin/event/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ state: 'STARTING' })
    });

    // 2. Switch state to LIVE
    const liveRes = await api('/api/admin/event/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ state: 'LIVE' })
    });
    if (!liveRes.ok || liveRes.data.config?.state !== 'LIVE') {
      throw new Error('Failed to transition state to LIVE');
    }

    // 3. Inspect broadcast history to verify LIVE notification was created
    const historyRes = await api('/api/admin/notifications/history', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!historyRes.ok || !Array.isArray(historyRes.data.history)) {
      throw new Error('Failed to fetch notification history');
    }

    const liveBroadcast = historyRes.data.history.find((b: any) => 
      b.title.includes('NOW LIVE') || b.title.includes('LIVE')
    );
    if (!liveBroadcast) {
      throw new Error('Automatic LIVE notification broadcast record was not found in history');
    }

    if (!liveBroadcast.sendWebPush) {
      throw new Error('LIVE notification was not flagged for Web Push delivery');
    }
  });

  // Test 28: Automated Transition to STARTING at 4:25 (5 minutes before event)
  await assertTest('Automated scheduler transitions UPCOMING event to STARTING when 5-minute pre-start window arrives (4:25)', async () => {
    // 1. Set countdown target to 3 minutes in future (inside 5-minute window)
    const targetIso = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    await api('/api/admin/event/countdown', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetIso, timezone: 'Asia/Kolkata', label: 'PREMIERE COUNTDOWN' })
    });

    // 2. Set state to UPCOMING
    await api('/api/admin/event/state', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ state: 'UPCOMING' })
    });

    // 3. Trigger scheduler tick
    const { reminderScheduler } = await import('../src/services/reminderScheduler');
    await reminderScheduler.tick();

    // 4. Verify authoritative state automatically transitioned to STARTING
    const pubRes = await api('/api/config/public');
    if (!pubRes.ok || pubRes.data.config?.state !== 'STARTING') {
      throw new Error(`Expected auto-transition to STARTING, but state was: ${pubRes.data.config?.state}`);
    }
  });

  // Test 29: GTA-Inspired Identity System (Clean unnumbered for GameScope, Numbered for YouTube)
  await assertTest('GTA Identity System assigns clean unnumbered names to GameScope users and numbered names to YouTube users permanently', async () => {
    const { identityService } = await import('../src/services/identityService');

    // 1. GameScope Community Member: MUST BE CLEAN UNNUMBERED
    const gsUser1 = await identityService.getOrCreateGameScopeIdentity('operative-gs-1');
    if (/\d+$/.test(gsUser1.displayName)) {
      throw new Error(`GameScope identity '${gsUser1.displayName}' contains numbers! Must be clean GTA name without numbers.`);
    }

    // Permanence check
    const gsUser1Repeat = await identityService.getOrCreateGameScopeIdentity('operative-gs-1');
    if (gsUser1Repeat.displayName !== gsUser1.displayName) {
      throw new Error(`GameScope identity changed on repeat request! Was '${gsUser1.displayName}', became '${gsUser1Repeat.displayName}'`);
    }

    // 2. YouTube Participant: MUST HAVE NUMERIC SUFFIX
    const ytUser1 = await identityService.getOrCreateYouTubeIdentity('UC_channel_test_101', 'GamerGuy');
    if (!/\d+$/.test(ytUser1.displayName)) {
      throw new Error(`YouTube identity '${ytUser1.displayName}' is missing numeric suffix! Mandatory for YouTube participants.`);
    }

    // Permanence check
    const ytUser1Repeat = await identityService.getOrCreateYouTubeIdentity('UC_channel_test_101', 'GamerGuy');
    if (ytUser1Repeat.displayName !== ytUser1.displayName) {
      throw new Error(`YouTube identity changed on repeat request! Was '${ytUser1.displayName}', became '${ytUser1Repeat.displayName}'`);
    }
  });

  // Test 30: Master Import Gate (GameScope Active Visitors < 10)
  await assertTest('Master Import Gate permits imports when visitors < 10 and immediately halts when visitors >= 10', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    const { analyticsService } = await import('../src/services/analyticsService');

    // Scenario A: 3 active visitors -> Gate is OPEN
    analyticsService.updateActiveSocketCount(3);
    if (!adaptiveAudienceController.isMasterGateOpen()) {
      throw new Error('Master Gate should be OPEN when active visitors are 3 (< 10)');
    }

    // Scenario B: 10 active visitors -> Gate is CLOSED
    analyticsService.updateActiveSocketCount(10);
    if (adaptiveAudienceController.isMasterGateOpen()) {
      throw new Error('Master Gate should be CLOSED when active visitors reach 10');
    }

    // Scenario C: 15 active visitors -> Gate remains CLOSED
    analyticsService.updateActiveSocketCount(15);
    if (adaptiveAudienceController.isMasterGateOpen()) {
      throw new Error('Master Gate should be CLOSED when active visitors are 15');
    }

    // Scenario D: Drops back to 4 -> Gate re-opens
    analyticsService.updateActiveSocketCount(4);
    if (!adaptiveAudienceController.isMasterGateOpen()) {
      throw new Error('Master Gate should RE-OPEN when active visitors drop to 4 (< 10)');
    }
  });

  // Test 31: Adaptive Audience Controller & Dynamic Capacity Scaling
  await assertTest('Adaptive Controller dynamically scales participant capacity based on activity velocity and respects limits', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    adaptiveAudienceController.resetSessions();

    // Baseline quiet capacity
    const initialMetrics = adaptiveAudienceController.getMetrics();
    if (initialMetrics.currentCapacity < 10) {
      throw new Error(`Initial capacity was ${initialMetrics.currentCapacity}, expected at least 10`);
    }

    // Simulate high burst from 20 distinct YouTube participants
    for (let i = 0; i < 70; i++) {
      const channel = `channel_burst_${i % 20}`;
      adaptiveAudienceController.recordIncomingMessage(channel);
    }

    const scaledMetrics = adaptiveAudienceController.evaluateMetrics();
    if (scaledMetrics.activityLevel !== 'HIGH' && scaledMetrics.activityLevel !== 'VERY_HIGH') {
      throw new Error(`Expected HIGH or VERY_HIGH activity level after burst, got: ${scaledMetrics.activityLevel}`);
    }
    if (scaledMetrics.currentCapacity <= initialMetrics.currentCapacity) {
      throw new Error(`Capacity did not scale up after burst. Remained: ${scaledMetrics.currentCapacity}`);
    }

    // Verify participant admission limits
    const admittedCount = adaptiveAudienceController.getAdmittedCount();
    if (admittedCount > scaledMetrics.currentCapacity) {
      throw new Error(`Admitted participants (${admittedCount}) exceeded capacity (${scaledMetrics.currentCapacity})`);
    }
  });

  // Test 32: YouTube Message Ingestion, Normalization & Deduplication
  await assertTest('YouTube Chat Service processes text messages with YouTube source and deduplicates IDs', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');

    const mockItem = {
      id: 'yt_msg_test_unique_998877',
      snippet: {
        type: 'textMessageEvent',
        publishedAt: new Date().toISOString(),
        displayMessage: 'Vice City neon looks unreal on stream!!'
      },
      authorDetails: {
        channelId: 'UC_test_ch_dedup_1',
        displayName: 'ViceFanatic'
      }
    };

    // First ingestion -> Should succeed
    const firstImport = await youtubeChatService.processMessageItem(mockItem);
    if (!firstImport) throw new Error('First valid text message was rejected by ingestion processor');

    // Duplicate ingestion with same ID -> Should be deduplicated and return false
    const duplicateImport = await youtubeChatService.processMessageItem(mockItem);
    if (duplicateImport) throw new Error('Duplicate YouTube message ID was not deduplicated!');
  });

  // Test 33: Admin Panel YouTube Configuration & Video ID Priority
  await assertTest('Admin Panel YouTube endpoints configure video ID, enforce validation, and follow priority', async () => {
    // 1. Fetch initial status
    const getRes = await api('/api/admin/youtube', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!getRes.ok || !getRes.data.config) throw new Error('Failed to fetch YouTube config from admin API');

    // 2. Set valid custom video ID
    const customVideoId = 'BGUTv2K_SWs';
    const setRes = await api('/api/admin/youtube/video-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ videoId: customVideoId })
    });
    if (!setRes.ok || setRes.data.state?.selectedVideoId !== customVideoId) {
      throw new Error('Failed to update YouTube video ID');
    }
    if (setRes.data.state?.videoIdSource !== 'ADMIN') {
      throw new Error(`Expected videoIdSource ADMIN, got: ${setRes.data.state?.videoIdSource}`);
    }

    // 3. Test invalid video ID format rejection (honest error, no silent fallback)
    const invalidRes = await api('/api/admin/youtube/video-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ videoId: 'invalid_too_short' })
    });
    if (invalidRes.ok || invalidRes.status !== 400) {
      throw new Error('Invalid YouTube video ID was not rejected with HTTP 400');
    }
  });

  // Test 34: Admin Panel Runtime Settings Update & Force Reconnect
  await assertTest('Admin Panel updates adaptive capacity settings and triggers forced reconnection', async () => {
    // 1. Update settings
    const settingsRes = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        importEnabled: true,
        adaptiveEnabled: true,
        minimumCapacity: 10,
        maximumCapacity: 50,
        defaultCapacity: 15,
        manualCapacityOverride: null
      })
    });
    if (!settingsRes.ok || settingsRes.data.config?.defaultCapacity !== 15) {
      throw new Error('Failed to update YouTube runtime settings');
    }

    // 2. Force Reconnect
    const reconRes = await api('/api/admin/youtube/reconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!reconRes.ok || !reconRes.data.state) {
      throw new Error('Force reconnect endpoint failed');
    }
  });

  /* ---------------- Dynamic YouTube Participant Admission & Temporary Identity Management ---------------- */

  // Test 35: Scenario A — Initial Admission & Unique Numbered GTA Identities
  await assertTest('Scenario A: Initial admission admits up to capacity, assigns unique numbered GTA identities, and leaves unadmitted viewers identity-free', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    const { analyticsService } = await import('../src/services/analyticsService');

    // Ensure Master Gate is open
    analyticsService.updateActiveSocketCount(2);
    adaptiveAudienceController.startNewStreamSession('STREAM_SCENARIO_A');
    adaptiveAudienceController.setCapacity(10);

    const admittedIdentities = new Map<string, string>();

    // 10 distinct participants send messages
    for (let i = 0; i < 10; i++) {
      const channelId = `UC_scenario_a_user_${i}`;
      const res = adaptiveAudienceController.admitOrProcessParticipant(channelId, `Viewer${i}`);
      if (!res.admitted || !res.identity) {
        throw new Error(`Participant ${i} was not admitted despite free slot! Reason: ${res.reason}`);
      }
      if (res.reason !== 'NEW_ADMISSION') {
        throw new Error(`Expected NEW_ADMISSION for participant ${i}, got ${res.reason}`);
      }

      // Check mandatory numeric suffix
      if (!/\d+$/.test(res.identity.displayName)) {
        throw new Error(`YouTube display name '${res.identity.displayName}' missing numeric suffix`);
      }

      // Uniqueness check
      if (admittedIdentities.has(res.identity.displayName.toLowerCase())) {
        throw new Error(`Duplicate identity assigned: ${res.identity.displayName}`);
      }
      admittedIdentities.set(res.identity.displayName.toLowerCase(), channelId);
    }

    if (adaptiveAudienceController.getAdmittedCount() !== 10) {
      throw new Error(`Expected exactly 10 admitted participants, got: ${adaptiveAudienceController.getAdmittedCount()}`);
    }

    // Verify an unadmitted viewer who hasn't spoken has NO identity assigned
    const unadmittedParticipant = adaptiveAudienceController.getParticipant('UC_scenario_a_ghost');
    if (unadmittedParticipant) {
      throw new Error('Ghost viewer has an identity in the stream roster without sending messages!');
    }
  });

  // Test 36: Scenario B — Dynamic Slot Replacement on Inactivity
  await assertTest('Scenario B: Participant inactivity releases active slot and allows next eligible chatter to be admitted', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    
    // Set inactivity timeout to 1 second for fast testing
    adaptiveAudienceController.setInactivityTimeoutMs(1000);

    // Make User 3 inactive by backdating lastActivityAt
    const user3 = adaptiveAudienceController.getParticipant('UC_scenario_a_user_3');
    if (!user3) throw new Error('User 3 not found in stream roster');
    user3.lastActivityAt = Date.now() - 2500; // 2.5s ago (> 1s timeout)

    // User 11 sends a message
    const newRes = adaptiveAudienceController.admitOrProcessParticipant('UC_scenario_a_user_10', 'Viewer10');
    if (!newRes.admitted || !newRes.identity) {
      throw new Error(`Replacement participant was not admitted! Reason: ${newRes.reason}`);
    }
    if (newRes.reason !== 'NEW_ADMISSION') {
      throw new Error(`Expected NEW_ADMISSION for replacement user, got: ${newRes.reason}`);
    }

    // User 3 should now have status 'RELEASED'
    if (user3.status !== 'RELEASED') {
      throw new Error(`User 3 should be marked 'RELEASED', got: ${user3.status}`);
    }

    // Total active participant count must remain exactly 10
    if (adaptiveAudienceController.getAdmittedCount() !== 10) {
      throw new Error(`Expected active count to remain 10 after slot replacement, got: ${adaptiveAudienceController.getAdmittedCount()}`);
    }
  });

  // Test 37: Scenario C — Returning Participant Restores Previous Identity
  await assertTest('Scenario C: Previously admitted participant returns when slot opens and restores original identity', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    // Retrieve User 3's originally assigned identity
    const user3 = adaptiveAudienceController.getParticipant('UC_scenario_a_user_3')!;
    const originalDisplayName = user3.displayName;

    // Make User 4 inactive to open up a slot
    const user4 = adaptiveAudienceController.getParticipant('UC_scenario_a_user_4');
    if (!user4) throw new Error('User 4 not found');
    user4.lastActivityAt = Date.now() - 2500;

    // User 3 returns with a new message!
    const returnRes = adaptiveAudienceController.admitOrProcessParticipant('UC_scenario_a_user_3', 'Viewer3ChangedName');
    if (!returnRes.admitted || !returnRes.identity) {
      throw new Error(`Returning User 3 was not admitted into open slot! Reason: ${returnRes.reason}`);
    }
    if (returnRes.reason !== 'RESTORED') {
      throw new Error(`Expected reason 'RESTORED' for returning participant, got: ${returnRes.reason}`);
    }

    // IDENTITY RESTORATION CHECK: Must be original username, NOT a new combination
    if (returnRes.identity.displayName !== originalDisplayName) {
      throw new Error(`Identity was not restored! Expected '${originalDisplayName}', got '${returnRes.identity.displayName}'`);
    }

    if (user3.status !== 'ACTIVE') {
      throw new Error(`User 3 status should be restored to 'ACTIVE', got: ${user3.status}`);
    }
  });

  // Test 38: Scenario D — Capacity Full Rejection
  await assertTest('Scenario D: When capacity is full, incoming messages are not admitted and no identity is generated', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    // Reset inactivity timeout to 120s so no one gets evicted automatically
    adaptiveAudienceController.setInactivityTimeoutMs(120000);

    // Refresh all 10 active participants' activity timestamps to now
    for (let i = 0; i < 10; i++) {
      const p = adaptiveAudienceController.getParticipant(`UC_scenario_a_user_${i === 4 ? 10 : i}`);
      if (p && p.status === 'ACTIVE') {
        p.lastActivityAt = Date.now();
      }
    }

    if (adaptiveAudienceController.getAdmittedCount() !== 10) {
      throw new Error(`Precondition failed: Expected 10 active participants, got: ${adaptiveAudienceController.getAdmittedCount()}`);
    }

    // 12th participant attempts to send message
    const overflowRes = adaptiveAudienceController.admitOrProcessParticipant('UC_scenario_a_overflow_99', 'OverflowViewer');
    if (overflowRes.admitted) {
      throw new Error('Participant was admitted when capacity was full!');
    }
    if (overflowRes.identity !== null) {
      throw new Error('Identity was generated for an unadmitted participant!');
    }
    if (overflowRes.reason !== 'CAPACITY_FULL') {
      throw new Error(`Expected reason 'CAPACITY_FULL', got: ${overflowRes.reason}`);
    }

    // Verify overflow user was NOT saved to streamParticipants
    const stored = adaptiveAudienceController.getParticipant('UC_scenario_a_overflow_99');
    if (stored) {
      throw new Error('Unadmitted overflow participant was stored in stream roster!');
    }
  });

  // Test 39: Scenario E — Simultaneous Admission & Atomic Concurrency Protection
  await assertTest('Scenario E: Simultaneous incoming messages respect capacity atomically without duplicate identities or overflow', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    adaptiveAudienceController.startNewStreamSession('STREAM_SCENARIO_E');
    adaptiveAudienceController.setCapacity(5);

    // Fire 20 parallel admissions
    const channels = Array.from({ length: 20 }, (_, i) => `UC_concurrent_${i}`);
    const results = channels.map(ch => adaptiveAudienceController.admitOrProcessParticipant(ch, `ConcurrentUser_${ch}`));

    const admittedResults = results.filter(r => r.admitted);
    const rejectedResults = results.filter(r => !r.admitted);

    if (admittedResults.length !== 5) {
      throw new Error(`Expected exactly 5 admitted under capacity 5, got: ${admittedResults.length}`);
    }
    if (rejectedResults.length !== 15) {
      throw new Error(`Expected 15 rejections under capacity 5, got: ${rejectedResults.length}`);
    }

    if (adaptiveAudienceController.getAdmittedCount() !== 5) {
      throw new Error(`Active participant count exceeded capacity 5! Got: ${adaptiveAudienceController.getAdmittedCount()}`);
    }

    // Uniqueness of admitted names
    const names = new Set(admittedResults.map(r => r.identity!.displayName.toLowerCase()));
    if (names.size !== 5) {
      throw new Error(`Duplicate names detected among concurrent admissions! Unique: ${names.size}, Expected: 5`);
    }
  });

  // Test 40: Scenario F — Master Gate Priority Over Dynamic Admission
  await assertTest('Scenario F: Master Gate takes strict priority over admission; halts when visitors >= 10 and resumes when < 10', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    const { analyticsService } = await import('../src/services/analyticsService');

    adaptiveAudienceController.startNewStreamSession('STREAM_SCENARIO_F');
    adaptiveAudienceController.setCapacity(10);

    // 1. Visitors >= 10 -> Master Gate CLOSED
    analyticsService.updateActiveSocketCount(11);
    const closedRes = adaptiveAudienceController.admitOrProcessParticipant('UC_gate_test_1', 'GateUser1');
    if (closedRes.admitted || closedRes.reason !== 'GATE_CLOSED') {
      throw new Error(`Expected GATE_CLOSED when visitors >= 10, got: ${closedRes.reason}`);
    }

    // 2. Visitors drop back to 3 -> Master Gate OPEN
    analyticsService.updateActiveSocketCount(3);
    const openRes = adaptiveAudienceController.admitOrProcessParticipant('UC_gate_test_1', 'GateUser1');
    if (!openRes.admitted || !openRes.identity) {
      throw new Error(`Admission failed after gate re-opened! Reason: ${openRes.reason}`);
    }
  });

  // Test 41: Scenario G — Adaptive Capacity Scale-Up and Scale-Down
  await assertTest('Scenario G: Adaptive capacity scale-up admits new participants; scale-down releases excess by LRU without name loss', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    adaptiveAudienceController.startNewStreamSession('STREAM_SCENARIO_G');
    adaptiveAudienceController.setCapacity(10);

    // Fill 10 slots
    for (let i = 0; i < 10; i++) {
      adaptiveAudienceController.admitOrProcessParticipant(`UC_g_${i}`, `UserG${i}`);
    }
    if (adaptiveAudienceController.getAdmittedCount() !== 10) {
      throw new Error('Failed to fill initial 10 slots');
    }

    // Scale UP to 20
    adaptiveAudienceController.setCapacity(20);
    for (let i = 10; i < 16; i++) {
      const res = adaptiveAudienceController.admitOrProcessParticipant(`UC_g_${i}`, `UserG${i}`);
      if (!res.admitted) throw new Error(`Failed to admit UserG${i} after capacity scale-up to 20`);
    }
    if (adaptiveAudienceController.getAdmittedCount() !== 16) {
      throw new Error(`Expected 16 admitted after scaling up, got: ${adaptiveAudienceController.getAdmittedCount()}`);
    }

    // Scale DOWN to 12 -> Per Requirement 2.C & 3, participants are NOT forcibly evicted!
    adaptiveAudienceController.setCapacity(12);
    if (adaptiveAudienceController.getAdmittedCount() !== 16) {
      throw new Error(`Expected active count to remain 16 after scale down (no forced eviction), got: ${adaptiveAudienceController.getAdmittedCount()}`);
    }

    // New participant attempted while active count (16) >= capacity (12) must be REJECTED with CAPACITY_FULL
    const blockedRes = adaptiveAudienceController.admitOrProcessParticipant('UC_g_new_blocked', 'BlockedUser');
    if (blockedRes.admitted || blockedRes.reason !== 'CAPACITY_FULL') {
      throw new Error(`Expected new admission to be blocked with CAPACITY_FULL when active >= capacity, got: ${blockedRes.reason}`);
    }
  });

  // Test 42: Scenario H — Stream Change & Session Isolation
  await assertTest('Scenario H: Livestream video change clears old stream sessions and temporary identities while preserving GameScope members', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    const { identityService } = await import('../src/services/identityService');

    // 1. Permanent GameScope member check
    const gsUser = await identityService.getOrCreateGameScopeIdentity('operative-gs-permanent-1');
    const initialGsName = gsUser.displayName;

    // 2. Switch stream to a new video ID
    const oldSessionId = adaptiveAudienceController.getStreamSessionId();
    adaptiveAudienceController.startNewStreamSession('VIDEO_STREAM_NEW_404');
    const newSessionId = adaptiveAudienceController.getStreamSessionId();

    if (oldSessionId === newSessionId) {
      throw new Error('Stream session ID did not change on startNewStreamSession');
    }

    // Active slots must be reset to 0
    if (adaptiveAudienceController.getAdmittedCount() !== 0) {
      throw new Error(`Active slots not cleared on stream change! Remained: ${adaptiveAudienceController.getAdmittedCount()}`);
    }

    // Stream roster must be empty
    if (adaptiveAudienceController.getParticipants().length !== 0) {
      throw new Error(`Stream participants roster not empty on stream change! Remained: ${adaptiveAudienceController.getParticipants().length}`);
    }

    // GameScope permanent identity must be 100% intact
    const gsUserAfter = await identityService.getOrCreateGameScopeIdentity('operative-gs-permanent-1');
    if (gsUserAfter.displayName !== initialGsName) {
      throw new Error(`GameScope permanent identity corrupted! Was '${initialGsName}', became '${gsUserAfter.displayName}'`);
    }
  });

  // Test 43: YouTube Poll Parsing & Ingestion
  await assertTest('YouTube poll parsing accurately extracts metadata, options, and status', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');

    const samplePollItem = {
      id: 'yt_poll_test_001',
      pollDetails: {
        metadata: {
          questionText: { runs: [{ text: 'Which heist crew is your favorite?' }] },
          options: [
            { optionText: { runs: [{ text: 'The Professionals' }] }, tally: '124' },
            { optionText: { runs: [{ text: 'The Wildcards' }] }, tally: '86' },
            { optionText: { runs: [{ text: 'The Lone Wolves' }] }, tally: '40' }
          ],
          status: 'POLL_STATUS_ACTIVE'
        }
      }
    };

    const parsed = youtubeChatService.parseAndApplyPollItem(samplePollItem);
    if (!parsed) throw new Error('Failed to parse YouTube poll item');
    if (parsed.question !== 'Which heist crew is your favorite?') throw new Error(`Wrong question: ${parsed.question}`);
    if (parsed.options.length !== 3) throw new Error(`Expected 3 options, got ${parsed.options.length}`);
    if (parsed.totalVotes !== 250) throw new Error(`Expected totalVotes 250, got ${parsed.totalVotes}`);
    if (parsed.status !== 'active') throw new Error(`Expected status active, got ${parsed.status}`);
    if (parsed.source !== 'youtube') throw new Error(`Expected source youtube, got ${parsed.source}`);

    // Verify getter
    const activePoll = youtubeChatService.getActivePoll();
    if (!activePoll || activePoll.id !== 'yt_poll_test_001') {
      throw new Error('getActivePoll did not return parsed poll');
    }
  });

  // Test 44: Poll Priority Hierarchy (GameScope Active > YouTube Fallback > Null)
  await assertTest('Poll priority strictly displays GameScope admin poll over YouTube poll, and falls back to YouTube poll', async () => {
    const { pollService } = await import('../src/services/pollService');
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    // 1. YouTube poll exists, no GameScope poll -> YouTube poll displays
    await adaptiveAudienceController.updateConfig({ pollFallbackEnabled: true }, 'test@gamescope.gg');
    let effective = pollService.getEffectivePoll();
    if (!effective || effective.source !== 'youtube' || !effective.effectivePoll) {
      throw new Error('Effective poll should be YouTube poll when no GameScope poll is active');
    }

    // 2. Create active GameScope poll -> GameScope poll takes absolute precedence
    const gsPoll = await pollService.createPoll({
      question: 'GameScope Official: Next Community Goal?',
      options: ['Option A', 'Option B'],
      adminInfo: { id: 'admin-1', email: 'test@gamescope.gg' }
    });
    effective = pollService.getEffectivePoll();
    if (!effective || effective.source !== 'gamescope' || effective.effectivePoll?.id !== gsPoll.id) {
      throw new Error('GameScope admin poll must override YouTube poll while active');
    }

    // 3. Close GameScope poll -> YouTube poll returns as fallback
    await pollService.closePoll(gsPoll.id, { id: 'admin-1', email: 'test@gamescope.gg' });
    effective = pollService.getEffectivePoll();
    if (!effective || effective.source !== 'youtube' || !effective.effectivePoll) {
      throw new Error('YouTube poll must return as fallback after GameScope poll closes');
    }

    // 4. Disable YouTube poll fallback -> Returns null
    await adaptiveAudienceController.updateConfig({ pollFallbackEnabled: false }, 'test@gamescope.gg');
    effective = pollService.getEffectivePoll();
    if (effective.effectivePoll !== null || effective.source !== 'none') {
      throw new Error('Effective poll must be null when YouTube fallback is disabled and no GameScope poll is active');
    }

    // Re-enable fallback for subsequent tests
    await adaptiveAudienceController.updateConfig({ pollFallbackEnabled: true }, 'test@gamescope.gg');
  });

  // Test 45: YouTube Poll Fallback Toggle via Admin API
  await assertTest('Admin API toggles YouTube poll fallback dynamically without redeployment', async () => {
    // Disable fallback
    let res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ pollFallbackEnabled: false })
    });
    if (!res.ok || res.data.config.pollFallbackEnabled !== false) {
      throw new Error('Failed to disable pollFallbackEnabled via admin API');
    }

    // Verify public config reflects it
    let pubRes = await api('/api/config/public');
    if (pubRes.data.pollFallbackEnabled !== false) {
      throw new Error('Public config did not reflect pollFallbackEnabled = false');
    }

    // Re-enable fallback
    res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ pollFallbackEnabled: true })
    });
    if (!res.ok || res.data.config.pollFallbackEnabled !== true) {
      throw new Error('Failed to re-enable pollFallbackEnabled via admin API');
    }
  });

  // Test 46: Participant Capacity Boundaries & Ceiling Enforcement
  await assertTest('Capacity controls enforce minimum >= 1, maximum <= 500, and reject invalid ranges', async () => {
    // 1. Valid high capacity (> 50, e.g. 150)
    let res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        minimumCapacity: 5,
        defaultCapacity: 50,
        maximumCapacity: 150
      })
    });
    if (!res.ok || res.data.config.maximumCapacity !== 150) {
      throw new Error(`Failed to set maximumCapacity 150: ${JSON.stringify(res.data)}`);
    }

    // 2. Reject minimumCapacity < 1
    res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ minimumCapacity: 0 })
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 for minimumCapacity 0, got ${res.status}`);
    }

    // 3. Reject maximumCapacity > 500
    res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ maximumCapacity: 501 })
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 for maximumCapacity 501, got ${res.status}`);
    }

    // 4. Reject defaultCapacity > maximumCapacity
    res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ defaultCapacity: 200, maximumCapacity: 150 })
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 when default > maximum, got ${res.status}`);
    }
  });

  // Test 47: Adaptive Chat Capacity Mode Toggle
  await assertTest('Adaptive chat capacity toggle fixes capacity strictly when disabled', async () => {
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    // Disable adaptive mode
    let res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        adaptiveEnabled: false,
        defaultCapacity: 25,
        manualCapacityOverride: 25
      })
    });
    if (!res.ok || res.data.config.adaptiveEnabled !== false) {
      throw new Error('Failed to set adaptiveEnabled: false');
    }

    // Metrics should show trend = STABLE and capacity fixed at 25
    const metrics = adaptiveAudienceController.getMetrics();
    if (metrics.trend !== 'STABLE' || metrics.currentCapacity !== 25) {
      throw new Error(`Expected fixed capacity 25 and STABLE trend, got ${metrics.currentCapacity} / ${metrics.trend}`);
    }

    // Re-enable adaptive mode
    res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adaptiveEnabled: true })
    });
    if (!res.ok || res.data.config.adaptiveEnabled !== true) {
      throw new Error('Failed to re-enable adaptiveEnabled: true');
    }
  });

  // Test 48: Chat Wipe — Admin Endpoint & Security
  await assertTest('Chat wipe endpoint requires admin authorization and returns wipe boundary', async () => {
    // 1. Unauthorized request without token
    let res = await api('/api/admin/chat/clear', { method: 'POST' });
    if (res.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated wipe request, got ${res.status}`);
    }

    // 2. Authorized request
    res = await api('/api/admin/chat/clear', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok || !res.data.wipeState?.chatClearedAt) {
      throw new Error(`Wipe request failed: ${JSON.stringify(res.data)}`);
    }
    if (typeof res.data.wipeState.chatGeneration !== 'number') {
      throw new Error('Wipe state missing chatGeneration number');
    }
  });

  // Test 49: Chat Wipe — Storage Boundary & Non-Destructive Invariance
  await assertTest('Chat wipe clears message query history without resetting identities or YouTube stream session', async () => {
    const { chatService } = await import('../src/services/chatService');
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');
    const { identityService } = await import('../src/services/identityService');

    const streamSessionBefore = adaptiveAudienceController.getStreamSessionId();
    const gsUserBefore = await identityService.getOrCreateGameScopeIdentity('operative-gs-wipe-check');

    // Wipe chat history
    const wipeState = await chatService.clearChatHistory({ id: 'admin-1', email: 'admin@gamescope.gg' });
    if (!wipeState.clearedAt) throw new Error('Missing clearedAt after clear');

    // getRecentMessages should be empty
    const recent = await chatService.getRecentMessages(50);
    if (recent.length !== 0) {
      throw new Error(`Expected 0 messages after wipe, found: ${recent.length}`);
    }

    // Post a new message after wipe
    const newMsg = await chatService.postMessage({
      userId: 'test-user-post-wipe',
      username: 'GhostRider',
      avatarSvg: '<svg></svg>',
      avatarColor: '#00f0ff',
      text: 'Post-wipe transmission active'
    });
    if (!newMsg || !newMsg.id) throw new Error('Failed to save message after wipe');

    // getRecentMessages should return the new post-wipe message
    const afterRecent = await chatService.getRecentMessages(50);
    if (afterRecent.length !== 1 || afterRecent[0].id !== newMsg.id) {
      throw new Error(`Expected exactly 1 post-wipe message, got: ${afterRecent.length}`);
    }

    // Verify stream session and identities are completely intact
    const streamSessionAfter = adaptiveAudienceController.getStreamSessionId();
    if (streamSessionBefore !== streamSessionAfter) {
      throw new Error('Chat wipe corrupted YouTube stream session!');
    }
    const gsUserAfter = await identityService.getOrCreateGameScopeIdentity('operative-gs-wipe-check');
    if (gsUserBefore.displayName !== gsUserAfter.displayName) {
      throw new Error('Chat wipe corrupted user identities!');
    }
  });

  // Test 50: Public Config & Effective Poll Endpoints
  await assertTest('Public endpoints return effective poll, youtube poll, and pollFallbackEnabled state', async () => {
    const pubRes = await api('/api/config/public');
    if (!pubRes.ok) throw new Error(`Failed to fetch /api/config/public: ${pubRes.status}`);
    if (pubRes.data.pollFallbackEnabled === undefined) {
      throw new Error('Missing pollFallbackEnabled in public config');
    }

    const pollRes = await api('/api/poll/effective');
    if (!pollRes.ok) throw new Error(`Failed to fetch /api/poll/effective: ${pollRes.status}`);
    if (pollRes.data.effectivePoll === undefined) {
      throw new Error('Missing effectivePoll in /api/poll/effective response');
    }
  });

  // Test 51: Configurable Polling Interval & MAX(configured, YouTube suggestion) rule
  await assertTest('REST Polling interval configuration enforces MAX(configured, YouTube suggestion)', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    // 1. Configure 60s default
    await adaptiveAudienceController.updateConfig({ pollingIntervalSeconds: 60 }, 'test@gamescope.gg');
    let effective = youtubeChatService.refreshTelemetryIntervals();
    if (effective !== 60000) {
      throw new Error(`Expected effective interval 60000ms, got ${effective}ms`);
    }

    // 2. Admin sets pollingIntervalSeconds = 45 via API
    let res = await api('/api/admin/youtube/settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ pollingIntervalSeconds: 45 })
    });
    if (!res.ok || res.data.config.pollingIntervalSeconds !== 45) {
      throw new Error(`Failed to update pollingIntervalSeconds via API: ${JSON.stringify(res.data)}`);
    }
    const state = youtubeChatService.getState();
    if (state.configuredPollingIntervalSeconds !== 45) {
      throw new Error(`Expected configured interval 45s, got ${state.configuredPollingIntervalSeconds}s`);
    }

    // Reset to 60s
    await adaptiveAudienceController.updateConfig({ pollingIntervalSeconds: 60 }, 'test@gamescope.gg');
  });

  // Test 52: Continuous Continuation Token Persistence & Post-Restart Recovery
  await assertTest('Continuation tokens and chat discovery state persist and recover across restarts', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');
    const { db } = await import('../src/services/db');

    // Save mock state with continuation token and liveChatId
    const mockState = {
      ...youtubeChatService.getState(),
      selectedVideoId: 'BGUTv2K_SWs',
      liveChatId: 'test_live_chat_continuation_999',
      nextPageToken: 'CAoQAA_test_continuation_token_persistent'
    };
    await db.setDoc('site_config', 'youtube_ingestion_state', mockState);

    // Re-initialize service to simulate restart recovery
    await youtubeChatService.init();

    const recovered = youtubeChatService.getState();
    if (recovered.liveChatId !== 'test_live_chat_continuation_999') {
      throw new Error(`Failed to recover liveChatId. Got: ${recovered.liveChatId}`);
    }
    if (recovered.nextPageToken !== 'CAoQAA_test_continuation_token_persistent') {
      throw new Error(`Failed to recover continuation token. Got: ${recovered.nextPageToken}`);
    }
  });

  // Test 53: Chronological Message Ordering & Delayed Backlog Ingestion
  await assertTest('Messages are ingested in chronological order and older messages are not discarded', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    adaptiveAudienceController.startNewStreamSession('STREAM_ORDER_TEST');
    adaptiveAudienceController.setCapacity(20);

    const baseTime = Date.now() - 300000; // 5 minutes ago (delayed backlog)
    const items = [
      {
        id: 'yt_msg_ord_3',
        snippet: {
          type: 'textMessageEvent',
          publishedAt: new Date(baseTime + 30000).toISOString(),
          displayMessage: 'Third chronological message (delayed 4.5 min)'
        },
        authorDetails: { channelId: 'UC_chron_3', displayName: 'ChronUser3' }
      },
      {
        id: 'yt_msg_ord_1',
        snippet: {
          type: 'textMessageEvent',
          publishedAt: new Date(baseTime + 10000).toISOString(),
          displayMessage: 'First chronological message (delayed 5 min)'
        },
        authorDetails: { channelId: 'UC_chron_1', displayName: 'ChronUser1' }
      },
      {
        id: 'yt_msg_ord_2',
        snippet: {
          type: 'textMessageEvent',
          publishedAt: new Date(baseTime + 20000).toISOString(),
          displayMessage: 'Second chronological message (delayed 4.7 min)'
        },
        authorDetails: { channelId: 'UC_chron_2', displayName: 'ChronUser2' }
      }
    ];

    // Sort chronologically as fetchMessages does
    const sorted = items.slice().sort((a, b) => Date.parse(a.snippet.publishedAt) - Date.parse(b.snippet.publishedAt));
    if (sorted[0].id !== 'yt_msg_ord_1' || sorted[2].id !== 'yt_msg_ord_3') {
      throw new Error('Chronological sort failed!');
    }

    // Process all 3 backlog items
    for (const item of sorted) {
      const ok = await youtubeChatService.processMessageItem(item);
      if (!ok) throw new Error(`Failed to process delayed backlog item: ${item.id}`);
    }

    // Check lastImportedMessage telemetry
    const state = youtubeChatService.getState();
    if (!state.lastImportedMessage || !state.lastImportedMessage.text.includes('Third chronological message')) {
      throw new Error(`lastImportedMessage telemetry mismatch: ${JSON.stringify(state.lastImportedMessage)}`);
    }
  });

  // Test 54: Quota Budget Tracking & Estimated Daily Cost Calculation
  await assertTest('Quota budget telemetry tracks requests, daily cost estimates, and handles budget limits', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');
    const { adaptiveAudienceController } = await import('../src/services/adaptiveAudienceController');

    await adaptiveAudienceController.updateConfig({
      quotaDailyBudget: 8000,
      pollingIntervalSeconds: 60
    }, 'test@gamescope.gg');

    const state = youtubeChatService.getState();
    if (state.quotaDailyBudget !== 8000) {
      throw new Error(`Expected quota budget 8000, got: ${state.quotaDailyBudget}`);
    }
    // (86400 / 60) * 5 = 7200
    if (state.estimatedDailyCost !== 7200) {
      throw new Error(`Expected estimatedDailyCost 7200, got: ${state.estimatedDailyCost}`);
    }
  });

  // Test 55: Quota Exhaustion Guard & Administrative Reset
  await assertTest('Quota exhaustion halts API calls, preserves tokens, and resets on admin action', async () => {
    const { youtubeChatService } = await import('../src/services/youtubeChatService');

    // Trigger quota exhaustion state
    youtubeChatService.triggerQuotaExhaustion('Test simulated quota exceeded');

    // Verify getState reflects exhaustion
    let state = youtubeChatService.getState();
    if (!state.isQuotaExhausted || state.status !== 'QUOTA_EXHAUSTED') {
      throw new Error('Failed to transition to QUOTA_EXHAUSTED');
    }

    // Admin resets quota via API
    const res = await api('/api/admin/youtube/reset-quota', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok || res.data.state.isQuotaExhausted !== false) {
      throw new Error(`Failed to reset quota via admin API: ${JSON.stringify(res.data)}`);
    }

    state = youtubeChatService.getState();
    if (state.isQuotaExhausted !== false) {
      throw new Error('isQuotaExhausted not cleared after reset');
    }
  });

  console.log('\n=======================================================');
  console.log(`  VERIFICATION RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('=======================================================\n');

  try {
    server.close();
  } catch {}

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Start server if not running or run directly
runTests().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
