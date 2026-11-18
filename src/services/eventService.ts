import { db } from './db';
import { auditService } from './auditService';
import { env } from '../config/env';
import { EventState, PublicEventConfig } from '../types';

export class EventService {
  private static instance: EventService;
  private currentConfig: PublicEventConfig;

  private constructor() {
    // Authoritative default configuration: 4:30 PM IST (11:00 UTC)
    const targetDate = new Date();
    targetDate.setUTCHours(11, 0, 0, 0);
    if (targetDate.getTime() < Date.now()) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }

    this.currentConfig = {
      eventId: env.DEFAULT_EVENT_ID,
      state: 'UPCOMING',
      stateUpdatedAt: Date.now(),
      expectedDurationMinutes: 360, // 6 hours broadcast expectation
      youtubeVideoId: env.DEFAULT_YOUTUBE_VIDEO_ID,
      youtubeStreamUrl: `https://www.youtube.com/watch?v=${env.DEFAULT_YOUTUBE_VIDEO_ID}`,
      countdown: {
        targetIso: targetDate.toISOString(),
        targetTimestampMs: targetDate.getTime(),
        timezone: 'Asia/Kolkata',
        label: '4:30 PM IST'
      },
      inactiveScreen: {
        enabled: true,
        heading: 'THE BROADCAST HAS CONCLUDED',
        description: 'Thank you for tuning in to the GameScope Live premiere event. Replay highlights and full breakdowns will be released shortly.',
        secondaryMessage: 'Follow GameScope Live for future premiere events and live community coverage.'
      },
      version: 1
    };
  }

  public static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }

  public async init(): Promise<void> {
    const saved = await db.getDoc<PublicEventConfig>('site_config', 'event_state');
    if (saved) {
      this.currentConfig = { ...this.currentConfig, ...saved };
    } else {
      await db.setDoc('site_config', 'event_state', this.currentConfig);
    }
  }

  public getConfig(): PublicEventConfig {
    return { ...this.currentConfig };
  }

  /**
   * Authoritative Event State Transition
   */
  public async updateState(
    newState: EventState,
    adminInfo: { id: string; email: string },
    ip?: string
  ): Promise<PublicEventConfig> {
    const validStates: EventState[] = ['UPCOMING', 'STARTING', 'LIVE', 'BREAK', 'ENDED'];
    if (!validStates.includes(newState)) {
      throw new Error(`Invalid event state: ${newState}. Must be one of ${validStates.join(', ')}`);
    }

    const previousState = this.currentConfig.state;
    this.currentConfig.state = newState;
    this.currentConfig.stateUpdatedAt = Date.now();
    this.currentConfig.version += 1;

    await db.setDoc('site_config', 'event_state', this.currentConfig);

    await auditService.logAction({
      adminId: adminInfo.id,
      adminEmail: adminInfo.email,
      action: 'UPDATE_EVENT_STATE',
      previousValue: previousState,
      newValue: newState,
      ip
    });

    // Synchronize automated reminder schedule with updated state
    try {
      const { reminderScheduler } = await import('./reminderScheduler');
      await reminderScheduler.syncWithEventConfig(this.getConfig());
    } catch (e: any) {
      console.warn('[EventService] Reminder sync warning on state update:', e.message);
    }

    // AUTOMATIC LIVE NOTIFICATION: Whenever event switches to LIVE, immediately push to all eligible client devices & browsers
    if (newState === 'LIVE') {
      try {
        const { notificationService } = await import('./notificationService');
        const { socketManager } = await import('../sockets/socketManager');

        console.log(`[EventService] Event transitioned to LIVE! Dispatching instant Web Push & in-site notification to all eligible subscribers...`);

        const pushBroadcast = await notificationService.broadcast({
          title: '🔴 GameScope Live is NOW LIVE!',
          body: 'The Grand Theft Auto VI livestream broadcast has officially begun! Tune in now to watch.',
          type: 'important',
          url: '/gtavi',
          sendInSite: true,
          sendWebPush: true,
          adminInfo: {
            id: adminInfo.id || 'system_live_trigger',
            email: adminInfo.email || 'system@gamescope.live'
          },
          inSiteDispatcher: (notif) => socketManager.broadcastInSiteNotification(notif)
        });

        console.log(
          `[EventService] LIVE push broadcast executed successfully: ${pushBroadcast.deliveryStats?.pushSuccessful ?? 0} accepted by push service out of ${pushBroadcast.deliveryStats?.totalEligible ?? 0} eligible subscribers.`
        );
      } catch (pushErr: any) {
        console.error('[EventService] Failed to dispatch LIVE push notification:', pushErr.message);
      }
    }

    return this.getConfig();
  }

  /**
   * Countdown Configuration Update
   */
  public async updateCountdown(params: {
    targetIso: string;
    timezone?: string;
    label?: string;
    adminInfo: { id: string; email: string };
    ip?: string;
  }): Promise<PublicEventConfig> {
    const targetDate = new Date(params.targetIso);
    if (isNaN(targetDate.getTime())) {
      throw new Error('Invalid target ISO date string provided.');
    }

    const prevCountdown = { ...this.currentConfig.countdown };
    this.currentConfig.countdown = {
      targetIso: targetDate.toISOString(),
      targetTimestampMs: targetDate.getTime(),
      timezone: params.timezone || 'Asia/Kolkata',
      label: params.label || `${targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${params.timezone || 'IST'}`
    };
    this.currentConfig.version += 1;

    await db.setDoc('site_config', 'event_state', this.currentConfig);

    await auditService.logAction({
      adminId: params.adminInfo.id,
      adminEmail: params.adminInfo.email,
      action: 'UPDATE_COUNTDOWN',
      previousValue: prevCountdown,
      newValue: this.currentConfig.countdown,
      ip: params.ip
    });

    // Synchronize automated reminder schedule with updated target timestamp
    try {
      const { reminderScheduler } = await import('./reminderScheduler');
      await reminderScheduler.syncWithEventConfig(this.getConfig());
    } catch (e: any) {
      console.warn('[EventService] Reminder sync warning on countdown update:', e.message);
    }

    return this.getConfig();
  }

  /**
   * YouTube Stream URL / Video ID Update
   */
  public async updateStream(params: {
    streamUrlOrId: string;
    expectedDurationMinutes?: number;
    adminInfo: { id: string; email: string };
    ip?: string;
  }): Promise<PublicEventConfig> {
    const videoId = this.extractYouTubeVideoId(params.streamUrlOrId);
    if (!videoId) {
      throw new Error('Invalid YouTube URL or Video ID. Please provide a valid YouTube watch URL, embed URL, short link, or 11-character video ID.');
    }

    const prevStream = {
      youtubeVideoId: this.currentConfig.youtubeVideoId,
      youtubeStreamUrl: this.currentConfig.youtubeStreamUrl,
      expectedDurationMinutes: this.currentConfig.expectedDurationMinutes
    };

    this.currentConfig.youtubeVideoId = videoId;
    this.currentConfig.youtubeStreamUrl = `https://www.youtube.com/watch?v=${videoId}`;
    if (params.expectedDurationMinutes && params.expectedDurationMinutes > 0) {
      this.currentConfig.expectedDurationMinutes = params.expectedDurationMinutes;
    }
    this.currentConfig.version += 1;

    await db.setDoc('site_config', 'event_state', this.currentConfig);

    await auditService.logAction({
      adminId: params.adminInfo.id,
      adminEmail: params.adminInfo.email,
      action: 'UPDATE_STREAM_URL',
      previousValue: prevStream,
      newValue: {
        youtubeVideoId: this.currentConfig.youtubeVideoId,
        youtubeStreamUrl: this.currentConfig.youtubeStreamUrl,
        expectedDurationMinutes: this.currentConfig.expectedDurationMinutes
      },
      ip: params.ip
    });

    return this.getConfig();
  }

  /**
   * Ended / Inactive Screen Content Update
   */
  public async updateInactiveScreen(params: {
    enabled: boolean;
    heading: string;
    description: string;
    secondaryMessage?: string;
    adminInfo: { id: string; email: string };
    ip?: string;
  }): Promise<PublicEventConfig> {
    const prev = { ...this.currentConfig.inactiveScreen };

    this.currentConfig.inactiveScreen = {
      enabled: params.enabled,
      heading: params.heading.trim(),
      description: params.description.trim(),
      secondaryMessage: params.secondaryMessage?.trim() || ''
    };
    this.currentConfig.version += 1;

    await db.setDoc('site_config', 'event_state', this.currentConfig);

    await auditService.logAction({
      adminId: params.adminInfo.id,
      adminEmail: params.adminInfo.email,
      action: 'UPDATE_INACTIVE_SCREEN',
      previousValue: prev,
      newValue: this.currentConfig.inactiveScreen,
      ip: params.ip
    });

    return this.getConfig();
  }

  /**
   * Force Sync Configuration
   */
  public async forceSync(adminInfo: { id: string; email: string }, ip?: string): Promise<PublicEventConfig> {
    this.currentConfig.version += 1;
    await db.setDoc('site_config', 'event_state', this.currentConfig);

    await auditService.logAction({
      adminId: adminInfo.id,
      adminEmail: adminInfo.email,
      action: 'FORCE_SYNCHRONIZATION',
      newValue: { version: this.currentConfig.version },
      ip
    });

    return this.getConfig();
  }

  public extractYouTubeVideoId(input: string): string | null {
    if (!input) return null;
    const clean = input.trim();
    // Bare 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
      return clean;
    }
    // Standard YouTube URLs
    const patterns = [
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([^"&?\/\s]{11})/i
    ];
    for (const pat of patterns) {
      const match = clean.match(pat);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }
}

export const eventService = EventService.getInstance();
