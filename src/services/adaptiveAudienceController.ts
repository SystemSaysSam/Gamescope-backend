import { db } from './db';
import { analyticsService } from './analyticsService';
import { queueService } from './queueService';
import { identityService } from './identityService';
import { 
  ActivityLevel, 
  AdaptiveChatMetrics, 
  YouTubeChatConfig, 
  YouTubeAdmittedParticipant,
  UserIdentity 
} from '../types';

export const MAX_CAPACITY_SAFETY_CEILING = 500;

export class AdaptiveAudienceController {
  private static instance: AdaptiveAudienceController;

  // Runtime Configuration
  private config: YouTubeChatConfig = {
    importEnabled: true,
    pollFallbackEnabled: true, // Display YouTube Live Polls when no GameScope admin poll is active
    adaptiveEnabled: true,
    minimumCapacity: 10,
    maximumCapacity: 100, // Safe default, allows administrator to scale up to MAX_CAPACITY_SAFETY_CEILING
    defaultCapacity: 10,
    manualCapacityOverride: null,
    inactivityTimeoutMs: 120000, // 2 minutes default inactivity threshold
    pollingIntervalSeconds: 60, // 60s default delayed continuous polling
    quotaDailyBudget: 10000, // 10,000 units/day standard budget
    updatedAt: Date.now(),
    updatedBy: 'system'
  };

  // Stream Session Scope (Section 11)
  private currentStreamId: string = '';
  private streamSessionId: string = `stream_init_${Date.now()}`;

  // Stream Participants Registry: channelId -> YouTubeAdmittedParticipant
  // Holds all participants who have been admitted during the current stream
  private streamParticipants = new Map<string, YouTubeAdmittedParticipant>();

  // Currently Active Participant Slots (occupying available capacity)
  private activeParticipantIds = new Set<string>();

  // Assigned YouTube names for this stream session (for uniqueness check and cleanup)
  private streamAssignedNames = new Set<string>();

  // Sliding window metrics (last 60 seconds)
  private messageTimestamps: { timestamp: number; channelId: string }[] = [];
  private currentCapacity: number = 10;
  private currentActivityLevel: ActivityLevel = 'QUIET';
  private trend: 'SCALING_UP' | 'SCALING_DOWN' | 'STABLE' = 'STABLE';

  private intervalTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startEvaluationLoop();
  }

  public static getInstance(): AdaptiveAudienceController {
    if (!AdaptiveAudienceController.instance) {
      AdaptiveAudienceController.instance = new AdaptiveAudienceController();
    }
    return AdaptiveAudienceController.instance;
  }

  public async init(): Promise<void> {
    try {
      const savedConfig = await db.getDoc<YouTubeChatConfig>('site_config', 'youtube_chat_config');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      } else {
        await db.setDoc('site_config', 'youtube_chat_config', this.config);
      }

      this.currentCapacity = this.config.manualCapacityOverride 
        ? Math.min(this.config.maximumCapacity, Math.max(this.config.minimumCapacity, this.config.manualCapacityOverride))
        : this.config.defaultCapacity;

      // Register live admitted participant count getter with AnalyticsService
      analyticsService.registerAdmittedCountGetter(() => this.getAdmittedCount());

      console.log(`[AdaptiveController] Initialized. Capacity: ${this.currentCapacity}, AdaptiveEnabled: ${this.config.adaptiveEnabled}`);
    } catch (err: any) {
      console.warn('[AdaptiveController] Init warning:', err.message);
    }
  }

  public getConfig(): YouTubeChatConfig {
    return { ...this.config };
  }

  public isPollFallbackEnabled(): boolean {
    return this.config.pollFallbackEnabled !== false;
  }

  public async updateConfig(newConfig: Partial<YouTubeChatConfig>, adminEmail: string): Promise<YouTubeChatConfig> {
    const min = typeof newConfig.minimumCapacity === 'number' ? newConfig.minimumCapacity : this.config.minimumCapacity;
    const max = typeof newConfig.maximumCapacity === 'number' ? newConfig.maximumCapacity : this.config.maximumCapacity;
    const def = typeof newConfig.defaultCapacity === 'number' ? newConfig.defaultCapacity : this.config.defaultCapacity;

    // Strict Server-Side Validation (Requirement 2.C)
    if (min < 1) {
      throw new Error('Minimum participant capacity must be at least 1.');
    }
    if (max > MAX_CAPACITY_SAFETY_CEILING) {
      throw new Error(`Maximum participant capacity cannot exceed the server safety ceiling of ${MAX_CAPACITY_SAFETY_CEILING}.`);
    }
    if (max < min) {
      throw new Error('Maximum participant capacity cannot be less than minimum capacity.');
    }
    if (def < min || def > max) {
      throw new Error(`Default capacity (${def}) must be between minimum (${min}) and maximum (${max}) capacity.`);
    }

    if (newConfig.manualCapacityOverride !== undefined && newConfig.manualCapacityOverride !== null) {
      const override = Number(newConfig.manualCapacityOverride);
      if (override < min || override > max) {
        throw new Error(`Manual capacity override (${override}) must be between minimum (${min}) and maximum (${max}) capacity.`);
      }
    }

    if (newConfig.pollingIntervalSeconds !== undefined && newConfig.pollingIntervalSeconds !== null) {
      const interval = Number(newConfig.pollingIntervalSeconds);
      if (isNaN(interval) || interval < 5 || interval > 600) {
        throw new Error('Polling interval must be between 5 and 600 seconds.');
      }
    }

    if (newConfig.quotaDailyBudget !== undefined && newConfig.quotaDailyBudget !== null) {
      const budget = Number(newConfig.quotaDailyBudget);
      if (isNaN(budget) || budget < 100 || budget > 1000000) {
        throw new Error('Quota daily budget must be between 100 and 1,000,000 units.');
      }
    }

    this.config = {
      ...this.config,
      ...newConfig,
      minimumCapacity: min,
      maximumCapacity: max,
      defaultCapacity: def,
      updatedAt: Date.now(),
      updatedBy: adminEmail
    };

    if (this.config.manualCapacityOverride !== null && this.config.manualCapacityOverride !== undefined) {
      this.currentCapacity = Math.min(
        this.config.maximumCapacity, 
        Math.max(this.config.minimumCapacity, this.config.manualCapacityOverride)
      );
    } else if (!this.config.adaptiveEnabled) {
      this.currentCapacity = this.config.defaultCapacity;
    }

    await db.setDoc('site_config', 'youtube_chat_config', this.config);
    return this.getConfig();
  }

  public getInactivityTimeoutMs(): number {
    return this.config.inactivityTimeoutMs && this.config.inactivityTimeoutMs > 0 
      ? this.config.inactivityTimeoutMs 
      : 120000;
  }

  public setInactivityTimeoutMs(ms: number) {
    this.config.inactivityTimeoutMs = ms;
  }

  /**
   * Master Import Gate Check
   * RULE: Active GameScope website visitors < 10 permits imports.
   * If active website visitors >= 10, imports IMMEDIATELY stop.
   */
  public isMasterGateOpen(): boolean {
    const activeWebsiteVisitors = analyticsService.getBaseWebsiteVisitors();
    return activeWebsiteVisitors < 10;
  }

  public isImportAllowed(): boolean {
    return this.config.importEnabled && this.isMasterGateOpen();
  }

  /**
   * Record incoming message for activity analysis & update activity timestamp
   */
  public recordIncomingMessage(channelId: string) {
    const now = Date.now();
    this.messageTimestamps.push({ timestamp: now, channelId });

    // Clean older than 60 seconds
    const cutoff = now - 60000;
    this.messageTimestamps = this.messageTimestamps.filter(m => m.timestamp >= cutoff);

    // Update participant session activity if currently admitted
    const participant = this.streamParticipants.get(channelId);
    if (participant && participant.status === 'ACTIVE') {
      participant.lastActivityAt = now;
      participant.messageCount += 1;
    }
  }

  /**
   * Release slots for participants inactive for over the configured timeout.
   * Section 3 & 7: The participant's active slot is released (status = 'RELEASED'),
   * but their identity mapping is PRESERVED in streamParticipants for returning!
   */
  public pruneInactiveSessions(now: number = Date.now()): number {
    const timeoutMs = this.getInactivityTimeoutMs();
    let releasedCount = 0;

    for (const channelId of Array.from(this.activeParticipantIds)) {
      const participant = this.streamParticipants.get(channelId);
      if (participant && (now - participant.lastActivityAt > timeoutMs)) {
        participant.status = 'RELEASED';
        this.activeParticipantIds.delete(channelId);
        releasedCount++;
        console.log(`[AdaptiveController] Participant ${participant.displayName} released slot due to inactivity (${Math.round((now - participant.lastActivityAt)/1000)}s silent). Active: ${this.activeParticipantIds.size}/${this.currentCapacity}`);
      }
    }

    if (releasedCount > 0) {
      analyticsService.notifyOnlineCountChanged();
    }
    return releasedCount;
  }

  /**
   * Evict excess active participants when capacity decreases below current active count.
   * Section 10: Uses Least Recently Active (LRU) policy.
   * Participants are marked 'RELEASED' (preserving their identities for the current livestream).
   */
  private evictExcessActive(countToEvict: number) {
    if (countToEvict <= 0) return;

    const activeList = Array.from(this.activeParticipantIds)
      .map(id => this.streamParticipants.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.lastActivityAt - b.lastActivityAt);

    const toRelease = activeList.slice(0, countToEvict);
    for (const p of toRelease) {
      p.status = 'RELEASED';
      this.activeParticipantIds.delete(p.channelId);
      console.log(`[AdaptiveController] Scaled down capacity: released slot for ${p.displayName} (LRU). Active: ${this.activeParticipantIds.size}/${this.currentCapacity}`);
    }
    if (toRelease.length > 0) {
      analyticsService.notifyOnlineCountChanged();
    }
  }

  /**
   * Synchronous, Atomic Participant Admission & Identity Management
   * Core Engine satisfying Sections 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
   */
  public admitOrProcessParticipant(
    channelId: string, 
    originalUsername: string, 
    streamId?: string
  ): { 
    admitted: boolean; 
    identity: UserIdentity | null; 
    reason: 'ACTIVE' | 'NEW_ADMISSION' | 'RESTORED' | 'GATE_CLOSED' | 'CAPACITY_FULL';
  } {
    // 1. Master Gate & Global Import Check (Section 9)
    if (!this.isImportAllowed()) {
      return { admitted: false, identity: null, reason: 'GATE_CLOSED' };
    }

    const now = Date.now();

    // 2. Livestream Session isolation (Section 11)
    if (streamId && this.currentStreamId && this.currentStreamId !== streamId) {
      this.startNewStreamSession(streamId);
    } else if (streamId && !this.currentStreamId) {
      this.currentStreamId = streamId;
    }

    // 3. Prune inactive participants (releases slots based on inactivity timeout)
    this.pruneInactiveSessions(now);

    // 4. Existing actively admitted participant (Section 2, step 4)
    const existing = this.streamParticipants.get(channelId);
    if (existing && existing.status === 'ACTIVE') {
      existing.lastActivityAt = now;
      existing.messageCount += 1;
      if (originalUsername && originalUsername !== existing.originalUsername) {
        existing.originalUsername = originalUsername;
      }
      return { admitted: true, identity: existing.assignedIdentity, reason: 'ACTIVE' };
    }

    // 6. Check available capacity (Section 2, step 5 & Section 3)
    const freeSlots = this.currentCapacity - this.activeParticipantIds.size;
    if (freeSlots <= 0) {
      // Capacity is full: DO NOT admit. DO NOT assign identity. DO NOT store documents.
      return { admitted: false, identity: null, reason: 'CAPACITY_FULL' };
    }

    // 7. Free slot available!
    // Case A: Returning participant whose slot was previously released (Section 4 & Section 8)
    if (existing && existing.status === 'RELEASED') {
      existing.status = 'ACTIVE';
      existing.lastActivityAt = now;
      existing.messageCount += 1;
      if (originalUsername) {
        existing.originalUsername = originalUsername;
      }
      this.activeParticipantIds.add(channelId);
      analyticsService.notifyOnlineCountChanged();
      console.log(`[AdaptiveController] Returning participant restored: ${existing.displayName} (${channelId})`);
      return { admitted: true, identity: existing.assignedIdentity, reason: 'RESTORED' };
    }

    // Case B: Brand new participant (Section 2, step 6 & Section 6)
    // Allocate a unique numbered GTA-inspired username
    const identity = identityService.generateYouTubeIdentitySync(
      channelId,
      originalUsername,
      this.streamAssignedNames
    );

    const participant: YouTubeAdmittedParticipant = {
      id: `yt_sess_${this.currentStreamId || 'stream'}_${channelId.substring(0, 16)}_${now}`,
      channelId,
      originalUsername: originalUsername || 'YouTubeViewer',
      streamSessionId: this.streamSessionId,
      streamId: this.currentStreamId,
      assignedIdentity: identity,
      displayName: identity.displayName,
      firstAdmittedAt: now,
      lastActivityAt: now,
      messageCount: 1,
      status: 'ACTIVE'
    };

    this.streamParticipants.set(channelId, participant);
    this.activeParticipantIds.add(channelId);
    this.streamAssignedNames.add(identity.normalizedName);
    analyticsService.notifyOnlineCountChanged();

    console.log(`[AdaptiveController] Admitted new YouTube participant: ${identity.displayName} [Active: ${this.activeParticipantIds.size}/${this.currentCapacity}]`);
    return { admitted: true, identity, reason: 'NEW_ADMISSION' };
  }

  /**
   * Backwards-compatible admission check
   */
  public tryAdmitParticipant(channelId: string, displayName: string, streamId: string): boolean {
    const res = this.admitOrProcessParticipant(channelId, displayName, streamId);
    return res.admitted;
  }

  /**
   * Start fresh livestream session & clean up stream-scoped state (Section 11)
   */
  public startNewStreamSession(newStreamId: string) {
    console.log(`[AdaptiveController] Starting fresh stream admission session for stream: '${newStreamId}' (previous: '${this.currentStreamId}')`);
    
    // Clean up temporary names from identityService
    identityService.releaseTemporaryNames(Array.from(this.streamAssignedNames));
    this.streamAssignedNames.clear();

    // Clear participant records
    this.streamParticipants.clear();
    this.activeParticipantIds.clear();

    // Reset rolling message timestamps
    this.messageTimestamps = [];

    // Reset session identifiers
    this.currentStreamId = newStreamId;
    this.streamSessionId = `stream_${newStreamId || 'default'}_${Date.now()}`;
    this.currentCapacity = this.config.defaultCapacity;
    this.currentActivityLevel = 'QUIET';
    this.trend = 'STABLE';
    analyticsService.notifyOnlineCountChanged();
  }

  /**
   * Clear all active sessions (e.g. on stream change or reset)
   */
  public resetSessions() {
    this.startNewStreamSession(this.currentStreamId);
  }

  /**
   * Evaluate rolling 60-second activity and adapt capacity & throughput (Section 10)
   */
  public evaluateMetrics(): AdaptiveChatMetrics {
    const now = Date.now();
    const cutoff = now - 60000;
    this.messageTimestamps = this.messageTimestamps.filter(m => m.timestamp >= cutoff);

    const messagesInWindow = this.messageTimestamps.length;
    const uniqueChatters = new Set(this.messageTimestamps.map(m => m.channelId)).size;
    const velocityPerSec = Number((messagesInWindow / 60).toFixed(2));
    const activeVisitors = analyticsService.getEffectiveActiveVisitors();
    const masterGateOpen = this.isMasterGateOpen();

    // Determine Activity Level based on velocity AND unique chatters
    let activityLevel: ActivityLevel = 'QUIET';
    if (messagesInWindow >= 120 && uniqueChatters >= 25) {
      activityLevel = 'VERY_HIGH';
    } else if (messagesInWindow >= 60 && uniqueChatters >= 15) {
      activityLevel = 'HIGH';
    } else if (messagesInWindow >= 20 && uniqueChatters >= 6) {
      activityLevel = 'MODERATE';
    } else {
      activityLevel = 'QUIET';
    }

    this.currentActivityLevel = activityLevel;

    // Adapt Capacity if adaptiveEnabled and not manually overridden
    if (this.config.adaptiveEnabled && (this.config.manualCapacityOverride === null || this.config.manualCapacityOverride === undefined)) {
      let targetCapacity = this.config.defaultCapacity;
      switch (activityLevel) {
        case 'VERY_HIGH':
          targetCapacity = Math.min(this.config.maximumCapacity, 200);
          break;
        case 'HIGH':
          targetCapacity = Math.min(this.config.maximumCapacity, 50);
          break;
        case 'MODERATE':
          targetCapacity = Math.min(this.config.maximumCapacity, 25);
          break;
        case 'QUIET':
        default:
          targetCapacity = this.config.defaultCapacity;
          break;
      }
      targetCapacity = Math.max(this.config.minimumCapacity, Math.min(this.config.maximumCapacity, targetCapacity));

      // Fast upward scale on genuine burst; gradual downward decay
      if (targetCapacity > this.currentCapacity) {
        this.currentCapacity = targetCapacity;
        this.trend = 'SCALING_UP';
      } else if (targetCapacity < this.currentCapacity) {
        this.currentCapacity = Math.max(targetCapacity, this.currentCapacity - 5);
        this.trend = 'SCALING_DOWN';
      } else {
        this.trend = 'STABLE';
      }
    } else {
      // Fixed capacity mode (Requirement 2.D): Capacity stays strictly fixed
      this.currentCapacity = this.config.manualCapacityOverride !== null && this.config.manualCapacityOverride !== undefined
        ? this.config.manualCapacityOverride
        : this.config.defaultCapacity;
      this.trend = 'STABLE';
    }

    // Adapt Worker Rate Limit Delay
    if (activityLevel === 'VERY_HIGH') {
      queueService.setRateLimitDelayMs(5);
    } else if (activityLevel === 'HIGH') {
      queueService.setRateLimitDelayMs(10);
    } else if (activityLevel === 'MODERATE') {
      queueService.setRateLimitDelayMs(15);
    } else {
      queueService.setRateLimitDelayMs(20);
    }

    this.pruneInactiveSessions(now);

    return {
      activityLevel,
      currentCapacity: this.currentCapacity,
      admittedParticipantCount: this.activeParticipantIds.size,
      activeParticipantCount: this.activeParticipantIds.size,
      releasedParticipantCount: this.streamParticipants.size - this.activeParticipantIds.size,
      inactivityTimeoutMs: this.getInactivityTimeoutMs(),
      messagesPerMinute: messagesInWindow,
      uniqueChattersInWindow: uniqueChatters,
      messageVelocityPerSec: velocityPerSec,
      queueDepth: queueService.getQueueStats().depth,
      processingLatencyMs: 0,
      trend: this.trend,
      masterGateOpen,
      activeGameScopeVisitors: activeVisitors,
      updatedAt: now
    };
  }

  private startEvaluationLoop() {
    if (!this.intervalTimer) {
      this.intervalTimer = setInterval(() => {
        this.evaluateMetrics();
      }, 5000);
    }
  }

  public getMetrics(): AdaptiveChatMetrics {
    return this.evaluateMetrics();
  }

  public getAdmittedCount(): number {
    return this.activeParticipantIds.size;
  }

  public getCurrentCapacity(): number {
    return this.currentCapacity;
  }

  public setCapacity(capacity: number) {
    this.currentCapacity = capacity;
    // NOTE (Requirement 2.C & 3): If capacity is reduced below active count,
    // existing participants are not forcibly removed. New admissions pause until active count falls below capacity.
  }

  public getStreamSessionId(): string {
    return this.streamSessionId;
  }

  public getCurrentStreamId(): string {
    return this.currentStreamId;
  }

  public getParticipants(): YouTubeAdmittedParticipant[] {
    return Array.from(this.streamParticipants.values());
  }

  public getParticipant(channelId: string): YouTubeAdmittedParticipant | undefined {
    return this.streamParticipants.get(channelId);
  }
}

export const adaptiveAudienceController = AdaptiveAudienceController.getInstance();
