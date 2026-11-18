import { db } from './db';
import { emailService } from './emailService';
import { notificationService } from './notificationService';
import { AnalyticsData, OnlineCountBreakdown } from '../types';

export class AnalyticsService {
  private static instance: AnalyticsService;
  private startTime: number = Date.now();
  private activeVisitorsCount: number = 0;
  private recentPings = new Map<string, number>();

  // Forced / Overridden Online Count (Section 1 & 2)
  private forcedOnlineCount: number | null = null;
  private forcedOnlineCountUpdatedAt: number | null = null;
  private forcedOnlineCountUpdatedBy: string | null = null;

  // Decoupled callbacks for admitted YouTube participants and socket broadcasts
  private admittedCountGetter: (() => number) | null = null;
  private broadcastNotifier: ((count: number) => void) | null = null;
  private lastReportedCount: number = -1;

  private constructor() {
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

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  public async init(): Promise<void> {
    try {
      const saved = await db.getDoc<{
        forcedCount: number | null;
        updatedAt: number | null;
        updatedBy: string | null;
      }>('site_config', 'online_count_override');

      if (saved && saved.forcedCount !== undefined && saved.forcedCount !== null) {
        this.forcedOnlineCount = Number(saved.forcedCount);
        this.forcedOnlineCountUpdatedAt = saved.updatedAt || Date.now();
        this.forcedOnlineCountUpdatedBy = saved.updatedBy || 'admin';
        console.log(`[AnalyticsService] Restored forced online count override: ${this.forcedOnlineCount} (set by ${this.forcedOnlineCountUpdatedBy})`);
      }
    } catch (err: any) {
      console.warn('[AnalyticsService] Init warning:', err.message);
    }
  }

  public registerAdmittedCountGetter(getter: () => number): void {
    this.admittedCountGetter = getter;
  }

  public registerBroadcastNotifier(notifier: (count: number) => void): void {
    this.broadcastNotifier = notifier;
  }

  public recordClientPing(clientId: string): void {
    const isNew = !this.recentPings.has(clientId);
    this.recentPings.set(clientId, Date.now());
    if (isNew) {
      this.notifyOnlineCountChanged();
    }
  }

  public updateActiveSocketCount(count: number): void {
    this.activeVisitorsCount = count;
    this.notifyOnlineCountChanged();
  }

  public getBaseWebsiteVisitors(): number {
    return Math.max(this.activeVisitorsCount, this.recentPings.size);
  }

  public getAdmittedLiveChatCount(): number {
    return this.admittedCountGetter ? this.admittedCountGetter() : 0;
  }

  /**
   * Effective Active Visitors:
   * 1. If admin forced count is set (>= 0), return forced count.
   * 2. Otherwise return combined count: Base website visitors (sockets/pings) + Admitted YouTube chat users.
   */
  public getEffectiveActiveVisitors(): number {
    if (this.forcedOnlineCount !== null && this.forcedOnlineCount >= 0) {
      return this.forcedOnlineCount;
    }
    return this.getBaseWebsiteVisitors() + this.getAdmittedLiveChatCount();
  }

  /**
   * Complete Breakdown for Admin Panel telemetry and controls
   */
  public getOnlineBreakdown(): OnlineCountBreakdown {
    const baseWebsiteVisitors = this.getBaseWebsiteVisitors();
    const admittedLiveChatUsers = this.getAdmittedLiveChatCount();
    const combinedAutoCount = baseWebsiteVisitors + admittedLiveChatUsers;
    const isForced = this.forcedOnlineCount !== null && this.forcedOnlineCount >= 0;
    const effectiveCount = isForced ? this.forcedOnlineCount! : combinedAutoCount;

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
  public async setForcedOnlineCount(count: number | null, adminEmail: string): Promise<OnlineCountBreakdown> {
    const validCount = typeof count === 'number' && !isNaN(count) && count >= 0 ? Math.floor(count) : null;
    this.forcedOnlineCount = validCount;
    this.forcedOnlineCountUpdatedAt = validCount !== null ? Date.now() : null;
    this.forcedOnlineCountUpdatedBy = validCount !== null ? adminEmail : null;

    await db.setDoc('site_config', 'online_count_override', {
      forcedCount: this.forcedOnlineCount,
      updatedAt: this.forcedOnlineCountUpdatedAt,
      updatedBy: this.forcedOnlineCountUpdatedBy
    });

    console.log(`[AnalyticsService] Admin ${adminEmail} ${validCount !== null ? `forced online count to: ${validCount}` : 'reset online count to automatic combined mode'}`);

    const breakdown = this.getOnlineBreakdown();
    this.notifyOnlineCountChanged(true);
    return breakdown;
  }

  public notifyOnlineCountChanged(forceEmit: boolean = false): void {
    const current = this.getEffectiveActiveVisitors();
    if (forceEmit || current !== this.lastReportedCount) {
      this.lastReportedCount = current;
      this.broadcastNotifier?.(current);
    }
  }

  public async getAnalytics(): Promise<AnalyticsData> {
    const activeVisitors = this.getEffectiveActiveVisitors();

    const [chatMessages, arcadeSessions, emailSubs, pushStats] = await Promise.all([
      db.getCollection<any>('chat_messages'),
      db.getCollection<any>('arcade_sessions'),
      emailService.getSubscribers(),
      notificationService.getStats()
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

export const analyticsService = AnalyticsService.getInstance();
