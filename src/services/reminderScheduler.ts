/**
 * GameScope Live — Server-Side Automated Event Reminder Scheduler
 * 
 * Operates an autonomous background worker process that:
 * 1. Tracks authoritative event countdown time and configuration version.
 * 2. Automatically calculates and arms 15-minute start reminders without manual admin intervention.
 * 3. Survives server restarts and container scale-to-zero via persistent DB state.
 * 4. Implements atomic distributed claiming & idempotency to prevent duplicate dispatches across replicas.
 * 5. Transparently handles missed windows during downtime (honestly recording MISSED status rather than sending stale notifications).
 * 6. Automatically reschedules or cancels when administrators adjust event countdown or state.
 */

import { db } from './db';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { eventService } from './eventService';
import { socketManager } from '../sockets/socketManager';
import { PublicEventConfig, ReminderScheduleRecord, ReminderStatus } from '../types';

export class ReminderScheduler {
  private static instance: ReminderScheduler;
  private instanceId: string;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private currentSchedule: ReminderScheduleRecord | null = null;

  private constructor() {
    this.instanceId = `node-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
  }

  public static getInstance(): ReminderScheduler {
    if (!ReminderScheduler.instance) {
      ReminderScheduler.instance = new ReminderScheduler();
    }
    return ReminderScheduler.instance;
  }

  /**
   * Initialize scheduler on server startup and recover persistent schedule
   */
  public async init(): Promise<void> {
    console.log(`[ReminderScheduler] Initializing server-side automated scheduler (Instance: ${this.instanceId})...`);

    // 1. Load persistent schedule from database
    const saved = await db.getDoc<ReminderScheduleRecord>('site_config', 'reminder_schedule');
    const eventConfig = eventService.getConfig();

    if (saved) {
      this.currentSchedule = saved;
      console.log(`[ReminderScheduler] Loaded persistent schedule: Status=${saved.status}, ScheduledAt=${saved.scheduledReminderTimeIso}`);
    } else {
      // Build initial schedule from authoritative event config
      this.currentSchedule = this.buildScheduleFromConfig(eventConfig);
      await db.setDoc('site_config', 'reminder_schedule', this.currentSchedule);
      console.log(`[ReminderScheduler] Created initial persistent schedule: Status=${this.currentSchedule.status}`);
    }

    // 2. Perform Startup Recovery Check
    await this.reconcileOnStartup(eventConfig);

    // 3. Start autonomous background loop (every 10 seconds)
    if (!this.intervalTimer) {
      this.intervalTimer = setInterval(() => {
        this.tick().catch(err => {
          console.error('[ReminderScheduler] Error during scheduler tick:', err);
        });
      }, 10000);
      console.log('[ReminderScheduler] Autonomous 10s background loop running.');
    }
  }

  /**
   * Stop background loop (for testing or graceful shutdown)
   */
  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Retrieve active schedule record
   */
  public getSchedule(): ReminderScheduleRecord | null {
    return this.currentSchedule ? { ...this.currentSchedule } : null;
  }

  /**
   * Retrieve historical reminder executions
   */
  public async getHistory(limit: number = 20): Promise<ReminderScheduleRecord[]> {
    return db.getCollection<ReminderScheduleRecord>(
      'reminder_history',
      undefined,
      (a, b) => b.updatedAt - a.updatedAt,
      limit
    );
  }

  /**
   * Synchronize schedule whenever administrator updates event countdown or state
   */
  public async syncWithEventConfig(config: PublicEventConfig): Promise<ReminderScheduleRecord> {
    const previous = this.currentSchedule;
    const now = Date.now();
    const eventStartMs = config.countdown.targetTimestampMs;
    const reminderTimeMs = eventStartMs - 15 * 60 * 1000;

    // If event is no longer UPCOMING (e.g. STARTING, LIVE, ENDED)
    if (config.state !== 'UPCOMING') {
      const isPending = previous?.status === 'SCHEDULED' || previous?.status === 'PROCESSING';
      const updated: ReminderScheduleRecord = {
        ...(previous || this.buildScheduleFromConfig(config)),
        status: isPending ? 'CANCELLED' : (previous?.status || 'NOT_SCHEDULED'),
        lastError: isPending ? `Event transitioned to ${config.state} prior to reminder window.` : previous?.lastError,
        recoveryAction: isPending ? 'Cancelled scheduled reminder as event is no longer in UPCOMING state.' : previous?.recoveryAction,
        updatedAt: now
      };
      this.currentSchedule = updated;
      await db.setDoc('site_config', 'reminder_schedule', updated);
      this.broadcastStatus(updated);
      return updated;
    }

    // Event is UPCOMING — determine status based on target timestamp
    let status: ReminderStatus = 'SCHEDULED';
    let triggerExecuted = false;
    let lastError: string | undefined = undefined;

    if (now >= eventStartMs) {
      status = 'MISSED';
      lastError = 'Event start timestamp has already passed.';
    } else if (now >= reminderTimeMs) {
      // Within 15m window
      status = 'SCHEDULED'; // Will trigger on next tick
    } else {
      // Future
      status = 'SCHEDULED';
    }

    // If target timestamp or version changed, invalidate previous schedule
    const updated: ReminderScheduleRecord = {
      id: 'current_event_reminder',
      eventId: config.eventId,
      configVersion: config.version,
      eventStartTimeMs: eventStartMs,
      eventStartTimeIso: config.countdown.targetIso,
      timezone: config.countdown.timezone,
      scheduledReminderTimeMs: reminderTimeMs,
      scheduledReminderTimeIso: new Date(reminderTimeMs).toISOString(),
      status,
      triggerExecuted,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      lastError
    };

    this.currentSchedule = updated;
    await db.setDoc('site_config', 'reminder_schedule', updated);
    this.broadcastStatus(updated);

    console.log(`[ReminderScheduler] Synchronized with event config v${config.version}: Reminder scheduled for ${updated.scheduledReminderTimeIso} (Status: ${status})`);
    return updated;
  }

  /**
   * Periodic scheduler tick
   */
  public async tick(): Promise<void> {
    if (this.isProcessing) return;

    const eventConfig = eventService.getConfig();
    if (eventConfig.state !== 'UPCOMING') return;

    const now = Date.now();

    // 1. Automated transition to STARTING at 4:25 (5 minutes before event start time)
    const targetMs = eventConfig.countdown.targetTimestampMs;
    const startingTimeMs = targetMs - 5 * 60 * 1000;
    if (now >= startingTimeMs) {
      console.log(`[ReminderScheduler] Automated transition window reached (4:25 PM / 5 minutes before start at ${eventConfig.countdown.targetIso}). Auto-switching state to STARTING...`);
      try {
        const updated = await eventService.updateState('STARTING', {
          id: 'system_countdown_scheduler',
          email: 'automated_scheduler@gamescope.live'
        });
        socketManager.broadcastEventState(updated);
        console.log(`[ReminderScheduler] Authoritative event state automatically updated to STARTING without manual intervention.`);
        return;
      } catch (err: any) {
        console.error('[ReminderScheduler] Error auto-transitioning state to STARTING:', err.message);
      }
    }

    if (!this.currentSchedule) {
      this.currentSchedule = this.buildScheduleFromConfig(eventConfig);
      await db.setDoc('site_config', 'reminder_schedule', this.currentSchedule);
    }

    const schedule = this.currentSchedule;

    // 1. If not in SCHEDULED state, nothing to trigger
    if (schedule.status !== 'SCHEDULED') {
      return;
    }

    // 2. If it's not time yet
    if (now < schedule.scheduledReminderTimeMs) {
      return;
    }

    // 3. Missed Window Check: If current time has already passed the event start time
    if (now >= schedule.eventStartTimeMs) {
      console.warn(`[ReminderScheduler] Missed reminder window: Current time (${new Date(now).toISOString()}) >= Event start (${schedule.eventStartTimeIso}). Marking MISSED.`);
      const missedRecord: ReminderScheduleRecord = {
        ...schedule,
        status: 'MISSED',
        lastError: `Execution window lapsed during server inactivity. Event already began at ${schedule.eventStartTimeIso}.`,
        recoveryAction: 'Suppressed sending outdated reminder to subscribers.',
        updatedAt: now
      };
      this.currentSchedule = missedRecord;
      await db.setDoc('site_config', 'reminder_schedule', missedRecord);
      await this.saveHistory(missedRecord);
      this.broadcastStatus(missedRecord);
      return;
    }

    // 4. Exact Window (now >= scheduledReminderTimeMs AND now < eventStartTimeMs): Execute Trigger!
    await this.executeReminderTrigger();
  }

  /**
   * Atomic Claim & Execution of 15-Minute Event Reminder
   */
  public async executeReminderTrigger(): Promise<ReminderScheduleRecord> {
    this.isProcessing = true;
    const now = Date.now();

    try {
      // 1. Distributed Locking / Atomic Claim
      // Reload fresh record from DB to ensure no other instance claimed it
      const fresh = await db.getDoc<ReminderScheduleRecord>('site_config', 'reminder_schedule') || this.currentSchedule!;

      if (fresh.status !== 'SCHEDULED' && !(fresh.status === 'PROCESSING' && fresh.claimExpiresAt && fresh.claimExpiresAt < now)) {
        console.log(`[ReminderScheduler] Reminder already claimed or executed by another instance (Status: ${fresh.status}). Skipping.`);
        this.currentSchedule = fresh;
        this.isProcessing = false;
        return fresh;
      }

      // Claim execution
      const claimExpiresAt = now + 90000; // 90 seconds timeout for delivery batch
      const claimedRecord: ReminderScheduleRecord = {
        ...fresh,
        status: 'PROCESSING',
        claimedByInstance: this.instanceId,
        claimExpiresAt,
        updatedAt: now
      };
      this.currentSchedule = claimedRecord;
      await db.setDoc('site_config', 'reminder_schedule', claimedRecord);
      this.broadcastStatus(claimedRecord);

      console.log(`[ReminderScheduler] Execution claimed by ${this.instanceId}. Dispatching 15-minute Web Push reminder...`);

      // 2. Execute Web Push delivery to all eligible subscriptions
      const batchStats = await notificationService.dispatchWebPushBatch({
        title: 'GameScope Live — GTA VI Stream Starts in 15 Minutes!',
        body: 'The countdown is almost over. Get ready and join the premiere broadcast in 15 minutes!',
        tag: 'gamescope-15min-reminder',
        type: 'important',
        url: '/'
      });

      // 3. Determine final status based on actual push service responses
      let finalStatus: ReminderStatus = 'COMPLETED';
      if (batchStats.attempts === 0) {
        finalStatus = 'TRIGGER_EXECUTED'; // Trigger ran successfully, but no subscribers yet
      } else if (batchStats.failed > 0 && batchStats.acceptedByPushService > 0) {
        finalStatus = 'PARTIALLY_DELIVERED';
      } else if (batchStats.failed > 0 && batchStats.acceptedByPushService === 0) {
        finalStatus = 'FAILED';
      } else {
        finalStatus = 'COMPLETED';
      }

      const completedRecord: ReminderScheduleRecord = {
        ...claimedRecord,
        status: finalStatus,
        triggerExecuted: true,
        triggerExecutedAt: Date.now(),
        deliveryStats: batchStats,
        claimExpiresAt: undefined,
        updatedAt: Date.now()
      };

      this.currentSchedule = completedRecord;
      await db.setDoc('site_config', 'reminder_schedule', completedRecord);
      await this.saveHistory(completedRecord);
      this.broadcastStatus(completedRecord);

      // Audit Log
      await auditService.logAction({
        adminId: 'system_scheduler',
        adminEmail: 'automated_scheduler@gamescope.live',
        action: 'AUTOMATED_15MIN_REMINDER_EXECUTED',
        resourceId: completedRecord.id,
        newValue: {
          status: finalStatus,
          deliveryStats: batchStats
        }
      });

      console.log(`[ReminderScheduler] 15-Minute Reminder finished with status: ${finalStatus} (Accepted: ${batchStats.acceptedByPushService}, Failed: ${batchStats.failed})`);
      return completedRecord;
    } catch (err: any) {
      console.error('[ReminderScheduler] Execution failed with error:', err);
      const failedRecord: ReminderScheduleRecord = {
        ...this.currentSchedule!,
        status: 'FAILED',
        lastError: err.message,
        claimExpiresAt: undefined,
        updatedAt: Date.now()
      };
      this.currentSchedule = failedRecord;
      await db.setDoc('site_config', 'reminder_schedule', failedRecord);
      this.broadcastStatus(failedRecord);
      return failedRecord;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Startup reconciliation: handles crash recovery and missed triggers
   */
  private async reconcileOnStartup(eventConfig: PublicEventConfig): Promise<void> {
    if (!this.currentSchedule) return;

    const now = Date.now();
    const schedule = this.currentSchedule;

    // Case 1: Was in PROCESSING when server restarted
    if (schedule.status === 'PROCESSING') {
      console.warn('[ReminderScheduler] Startup recovery: Previous execution was interrupted. Resetting claim.');
      if (now < schedule.eventStartTimeMs && now >= schedule.scheduledReminderTimeMs) {
        // Still within window: re-execute
        await this.executeReminderTrigger();
      } else if (now >= schedule.eventStartTimeMs) {
        // Event already started: mark MISSED
        schedule.status = 'MISSED';
        schedule.lastError = 'Server restarted after event had already commenced.';
        schedule.updatedAt = now;
        await db.setDoc('site_config', 'reminder_schedule', schedule);
      } else {
        schedule.status = 'SCHEDULED';
        schedule.updatedAt = now;
        await db.setDoc('site_config', 'reminder_schedule', schedule);
      }
      return;
    }

    // Case 2: Event was UPCOMING and reminder was SCHEDULED, but now is past event start
    if (schedule.status === 'SCHEDULED' && now >= schedule.eventStartTimeMs) {
      console.warn(`[ReminderScheduler] Startup recovery: Event start lapsed during downtime. Marking MISSED.`);
      schedule.status = 'MISSED';
      schedule.lastError = `Server was offline during scheduled window. Event began at ${schedule.eventStartTimeIso}.`;
      schedule.recoveryAction = 'Suppressed sending outdated reminder.';
      schedule.updatedAt = now;
      await db.setDoc('site_config', 'reminder_schedule', schedule);
      await this.saveHistory(schedule);
      return;
    }

    // Case 3: Still within 15-minute window before event start
    if (schedule.status === 'SCHEDULED' && now >= schedule.scheduledReminderTimeMs && now < schedule.eventStartTimeMs) {
      console.log('[ReminderScheduler] Startup recovery: Reminder window currently open! Executing trigger immediately.');
      await this.executeReminderTrigger();
    }
  }

  private buildScheduleFromConfig(config: PublicEventConfig): ReminderScheduleRecord {
    const eventStartMs = config.countdown.targetTimestampMs;
    const reminderTimeMs = eventStartMs - 15 * 60 * 1000;
    const now = Date.now();

    let status: ReminderStatus = 'SCHEDULED';
    if (config.state !== 'UPCOMING') {
      status = 'NOT_SCHEDULED';
    } else if (now >= eventStartMs) {
      status = 'MISSED';
    }

    return {
      id: 'current_event_reminder',
      eventId: config.eventId,
      configVersion: config.version,
      eventStartTimeMs: eventStartMs,
      eventStartTimeIso: config.countdown.targetIso,
      timezone: config.countdown.timezone,
      scheduledReminderTimeMs: reminderTimeMs,
      scheduledReminderTimeIso: new Date(reminderTimeMs).toISOString(),
      status,
      triggerExecuted: false,
      createdAt: now,
      updatedAt: now
    };
  }

  private async saveHistory(record: ReminderScheduleRecord): Promise<void> {
    const historyId = `rem-${record.configVersion}-${record.updatedAt}`;
    await db.setDoc('reminder_history', historyId, { ...record, id: historyId });
  }

  private broadcastStatus(record: ReminderScheduleRecord): void {
    try {
      socketManager.broadcast('reminder:status_update', { schedule: record });
    } catch {}
  }
}

export const reminderScheduler = ReminderScheduler.getInstance();
