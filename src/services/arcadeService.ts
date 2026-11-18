import { db } from './db';
import { eventService } from './eventService';
import { auditService } from './auditService';
import { chatService } from './chatService';
import { ArcadeScoreSubmission, ArcadeSession, LeaderboardEntry } from '../types';

export class ArcadeService {
  private static instance: ArcadeService;
  private activeSessions = new Map<string, ArcadeSession>();

  private constructor() {}

  public static getInstance(): ArcadeService {
    if (!ArcadeService.instance) {
      ArcadeService.instance = new ArcadeService();
    }
    return ArcadeService.instance;
  }

  public async init(): Promise<void> {
    // Seed initial curated competitive scores if empty
    const existing = await this.getLeaderboard(1);
    if (existing.length === 0) {
      const initialSeed: Omit<LeaderboardEntry, 'rank'>[] = [
        { id: 'sc-1', playerId: 'NeonFox', username: 'NeonFox', score: 5210, metric: 'Meters Evaded', badge: 'APEX RACER', submittedAt: Date.now() - 3600000, isValid: true },
        { id: 'sc-2', playerId: 'PalmRacer', username: 'PalmRacer', score: 4380, metric: 'Meters Evaded', badge: 'ELITE DRIVER', submittedAt: Date.now() - 3200000, isValid: true },
        { id: 'sc-3', playerId: 'TurboKoi', username: 'TurboKoi', score: 3560, metric: 'Meters Evaded', badge: 'PRO', submittedAt: Date.now() - 2800000, isValid: true },
        { id: 'sc-4', playerId: 'Biscayne', username: 'Biscayne', score: 2740, metric: 'Meters Evaded', submittedAt: Date.now() - 2400000, isValid: true },
        { id: 'sc-5', playerId: 'Coral99', username: 'Coral99', score: 1980, metric: 'Meters Evaded', submittedAt: Date.now() - 1900000, isValid: true },
        { id: 'sc-6', playerId: 'SunsetKid', username: 'SunsetKid', score: 1340, metric: 'Meters Evaded', submittedAt: Date.now() - 1500000, isValid: true },
        { id: 'sc-7', playerId: 'Gearhead', username: 'Gearhead', score: 820, metric: 'Meters Evaded', submittedAt: Date.now() - 1000000, isValid: true }
      ];

      for (const entry of initialSeed) {
        await db.setDoc('arcade_scores', entry.id, entry);
      }
    }
  }

  /**
   * Start a verified arcade session
   */
  public async startSession(playerId: string, playerName: string): Promise<{
    ok: boolean;
    sessionId?: string;
    seed?: number;
    rulesVersion?: number;
    expiresAt?: number;
    code?: string;
  }> {
    const streamState = eventService.getConfig().state;
    if (streamState !== 'UPCOMING' && streamState !== 'BREAK') {
      return {
        ok: false,
        code: streamState === 'STARTING' ? 'EVENT_CLOSING' : 'EVENT_NOT_ACTIVE'
      };
    }

    const sessionId = `vcr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const session: ArcadeSession = {
      sessionId,
      playerId: playerId.trim() || 'anon',
      playerName: playerName.trim() || 'Guest Driver',
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      completed: false,
      seed: 20260617,
      rulesVersion: 1
    };

    this.activeSessions.set(sessionId, session);
    await db.setDoc('arcade_sessions', sessionId, session);

    return {
      ok: true,
      sessionId,
      seed: session.seed,
      rulesVersion: session.rulesVersion,
      expiresAt: Date.now() + 600000
    };
  }

  /**
   * Arcade heartbeat to ensure active session
   */
  public heartbeat(sessionId: string): { ok: boolean; code?: string } {
    const streamState = eventService.getConfig().state;
    const session = this.activeSessions.get(sessionId);
    if (!session || session.completed) {
      return { ok: false, code: 'SESSION_INVALID' };
    }

    session.lastHeartbeat = Date.now();
    return {
      ok: streamState === 'UPCOMING' || streamState === 'BREAK',
      code: streamState === 'STARTING' ? 'EVENT_CLOSING' : undefined
    };
  }

  /**
   * Submit and Validate Run Result Server-Side
   */
  public async submitResult(sub: ArcadeScoreSubmission): Promise<{
    ok: boolean;
    finalDistance?: number;
    personalBest?: number;
    rank?: number | null;
    isRecord?: boolean;
    code?: string;
  }> {
    const streamState = eventService.getConfig().state;
    if (streamState === 'LIVE') {
      return { ok: false, code: 'EVENT_NOT_ACTIVE' };
    }

    let session = this.activeSessions.get(sub.sessionId);
    if (!session) {
      const persisted = await db.getDoc<ArcadeSession>('arcade_sessions', sub.sessionId);
      if (persisted) session = persisted;
    }

    if (!session) {
      return { ok: false, code: 'SESSION_UNKNOWN' };
    }
    if (session.completed) {
      return { ok: false, code: 'DUPLICATE_SUBMISSION' };
    }

    session.completed = true;
    this.activeSessions.delete(sub.sessionId);
    await db.updateDoc('arcade_sessions', sub.sessionId, { completed: true, completedAt: Date.now() });

    // Server-Side Physics Validation
    const distance = Math.max(0, Math.round(sub.distance));
    const duration = Math.max(1, sub.stats.duration || 1);
    const maxPlausibleDistance = Math.round(64 * (duration + 2)); // v_max is 64 m/s in simulation engine

    if (distance > maxPlausibleDistance) {
      console.warn(`[Arcade] Rejected implausible score: distance ${distance}m in ${duration}s (max allowed ${maxPlausibleDistance}m)`);
      return { ok: false, code: 'SCORE_PLAUSIBILITY_FAILED' };
    }

    // Save score entry
    const scoreId = `sc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const scoreDoc = {
      id: scoreId,
      sessionId: sub.sessionId,
      playerId: sub.playerId,
      username: sub.playerName || session.playerName,
      score: distance,
      metric: 'Meters Evaded',
      stats: sub.stats,
      endReason: sub.endReason,
      submittedAt: Date.now(),
      isValid: true
    };

    await db.setDoc('arcade_scores', scoreId, scoreDoc);

    // Compute player's personal best
    const playerScores = await db.getCollection<any>(
      'arcade_scores',
      (s) => s.playerId === sub.playerId && s.isValid
    );
    const personalBest = Math.max(...playerScores.map(s => s.score), distance);
    const isRecord = distance >= personalBest;

    // Compute ranking on leaderboard
    const allValid = await this.getLeaderboard(100);
    const myRankIdx = allValid.findIndex(e => e.playerId === sub.playerId);
    const rank = myRankIdx !== -1 ? myRankIdx + 1 : null;

    // If new #1 record and distance > 500m, broadcast a shoutout in chat!
    if (rank === 1 && isRecord && distance > 500) {
      chatService.postMessage({
        userId: 'system-shoutout',
        username: 'GAMESCOPE SYSTEM',
        avatarSvg: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0d181c"/><circle cx="20" cy="17" r="8" stroke="#00ff88" stroke-width="2" fill="#132629"/><circle cx="17" cy="16" r="2" fill="#00f0ff"/><circle cx="23" cy="16" r="2" fill="#00f0ff"/><path d="M11 29C12.5 24 16 22 20 22C24 22 27.5 24 29 29" stroke="#00ff88" stroke-width="2"/></svg>`,
        avatarColor: '#ffaa00',
        text: `${sub.playerName} claimed the #1 spot in Vice City Run with ${distance.toLocaleString()} meters!`,
        badge: 'NEW RECORD'
      }).catch(() => {});
    }

    return {
      ok: true,
      finalDistance: distance,
      personalBest,
      rank,
      isRecord
    };
  }

  /**
   * Get Leaderboard with calculated ranks (Best score per unique player)
   */
  public async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const rawScores = await db.getCollection<any>(
      'arcade_scores',
      (s) => s.isValid === true
    );

    // Deduplicate by playerId, keeping highest score
    const bestByPlayer = new Map<string, any>();
    for (const sc of rawScores) {
      const existing = bestByPlayer.get(sc.playerId);
      if (!existing || sc.score > existing.score) {
        bestByPlayer.set(sc.playerId, sc);
      }
    }

    const sorted = Array.from(bestByPlayer.values()).sort((a, b) => b.score - a.score);

    return sorted.slice(0, limit).map((s, idx) => ({
      rank: idx + 1,
      id: s.id,
      playerId: s.playerId,
      username: s.username,
      score: s.score,
      metric: s.metric || 'Meters Evaded',
      badge: s.badge || (idx === 0 ? 'APEX RACER' : idx === 1 ? 'ELITE DRIVER' : idx === 2 ? 'PRO' : undefined),
      submittedAt: s.submittedAt,
      isValid: s.isValid
    }));
  }

  /**
   * Admin: Invalidate or Remove Score
   */
  public async invalidateScore(scoreId: string, adminInfo: { id: string; email: string }): Promise<void> {
    const existing = await db.getDoc<any>('arcade_scores', scoreId);
    if (!existing) throw new Error('Score record not found.');

    await db.updateDoc('arcade_scores', scoreId, { isValid: false, invalidatedBy: adminInfo.email, invalidatedAt: Date.now() });

    await auditService.logAction({
      adminId: adminInfo.id,
      adminEmail: adminInfo.email,
      action: 'INVALIDATE_ARCADE_SCORE',
      resourceId: scoreId,
      previousValue: existing
    });
  }

  /**
   * Admin: Reset Leaderboard
   */
  public async resetLeaderboard(adminInfo: { id: string; email: string }): Promise<void> {
    const allScores = await db.getCollection<any>('arcade_scores');
    for (const sc of allScores) {
      await db.deleteDoc('arcade_scores', sc.id);
    }

    await auditService.logAction({
      adminId: adminInfo.id,
      adminEmail: adminInfo.email,
      action: 'RESET_ARCADE_LEADERBOARD',
      newValue: { clearedScoresCount: allScores.length }
    });
  }

  /**
   * Admin: Inspect Game Sessions
   */
  public async getRecentSessions(limit: number = 30): Promise<ArcadeSession[]> {
    return db.getCollection<ArcadeSession>(
      'arcade_sessions',
      undefined,
      (a, b) => b.startedAt - a.startedAt,
      limit
    );
  }
}

export const arcadeService = ArcadeService.getInstance();
