import { db } from './db';
import { emailService } from './emailService';
import { notificationService } from './notificationService';
import { AnalyticsData } from '../types';

export class AnalyticsService {
  private static instance: AnalyticsService;
  private startTime: number = Date.now();
  private activeVisitorsCount: number = 0;
  private recentPings = new Map<string, number>();

  private constructor() {
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

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  public recordClientPing(clientId: string): void {
    this.recentPings.set(clientId, Date.now());
  }

  public updateActiveSocketCount(count: number): void {
    this.activeVisitorsCount = count;
  }

  public getEffectiveActiveVisitors(): number {
    return Math.max(this.activeVisitorsCount, this.recentPings.size);
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
