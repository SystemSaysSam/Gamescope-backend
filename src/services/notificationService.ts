import crypto from 'crypto';
import webpush from 'web-push';
import { db } from './db';
import { auditService } from './auditService';
import { env } from '../config/env';
import { 
  NotificationBroadcast, 
  PushSubscriptionRecord, 
  DeliveryBatchStats 
} from '../types';

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {
    this.initWebPush();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private initWebPush() {
    try {
      webpush.setVapidDetails(
        env.VAPID.subject,
        env.VAPID.publicKey,
        env.VAPID.privateKey
      );
      console.log('[NotificationService] Web Push VAPID initialized successfully.');
    } catch (e: any) {
      console.warn('[NotificationService] Web Push VAPID warning:', e.message);
    }
  }

  public getVapidPublicKey(): string {
    return env.VAPID.publicKey;
  }

  /**
   * Deterministic SHA-256 document ID for push endpoints
   */
  public getSubscriptionDocId(endpoint: string): string {
    return crypto.createHash('sha256').update(endpoint).digest('hex');
  }

  /**
   * Register or update a browser push subscription (Idempotent)
   */
  public async subscribe(params: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userId?: string;
    userAgent?: string;
  }): Promise<PushSubscriptionRecord> {
    const docId = this.getSubscriptionDocId(params.endpoint);
    const existing = await db.getDoc<PushSubscriptionRecord>('push_subscriptions', docId);

    const now = Date.now();
    const record: PushSubscriptionRecord = {
      id: docId,
      endpoint: params.endpoint,
      keys: params.keys,
      userId: params.userId || existing?.userId,
      userAgent: params.userAgent || existing?.userAgent,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      failedAttempts: 0,
      active: true,
      lastError: undefined,
      expiredAt: undefined
    };

    await db.setDoc('push_subscriptions', docId, record);
    console.log(`[NotificationService] Push subscription registered/updated: docId=${docId.substring(0, 12)}... (Active: true)`);
    return record;
  }

  /**
   * Unsubscribe a push endpoint
   */
  public async unsubscribe(endpoint: string): Promise<void> {
    const docId = this.getSubscriptionDocId(endpoint);
    await db.updateDoc('push_subscriptions', docId, { 
      active: false, 
      unsubscribedAt: Date.now() 
    });
  }

  /**
   * Get subscription counts & statistics
   */
  public async getStats(): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    expiredSubscriptions: number;
  }> {
    const all = await db.getCollection<PushSubscriptionRecord>('push_subscriptions');
    const active = all.filter(s => s.active).length;
    return {
      totalSubscriptions: all.length,
      activeSubscriptions: active,
      expiredSubscriptions: all.length - active
    };
  }

  /**
   * Send a Web Push notification to all active subscribers with chunked concurrency & failure tracking
   */
  public async dispatchWebPushBatch(payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
    type?: 'info' | 'important' | 'warning';
  }): Promise<DeliveryBatchStats> {
    const activeSubs = await db.getCollection<PushSubscriptionRecord>(
      'push_subscriptions',
      (s) => s.active === true
    );

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/assets/gta6poster.jpg',
      badge: payload.badge || '/favicon.svg',
      tag: payload.tag || `gamescope-${Date.now()}`,
      url: payload.url || '/',
      type: payload.type || 'info',
      timestamp: Date.now()
    });

    let acceptedByPushService = 0;
    let failed = 0;
    let expiredSubscriptions = 0;
    const errors: string[] = [];

    // Concurrency control: batches of 25 parallel requests
    const BATCH_SIZE = 25;
    for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
      const batch = activeSubs.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: sub.keys
              },
              notificationPayload
            );
            acceptedByPushService++;

            // Record successful delivery timestamp
            const docId = sub.id || this.getSubscriptionDocId(sub.endpoint);
            await db.updateDoc('push_subscriptions', docId, {
              lastDeliveredAt: Date.now(),
              failedAttempts: 0
            });
          } catch (err: any) {
            failed++;
            const docId = sub.id || this.getSubscriptionDocId(sub.endpoint);
            const statusCode = err.statusCode || 500;
            const errMsg = err.message || `HTTP ${statusCode}`;

            if (errors.length < 10) {
              errors.push(`Endpoint [${docId.substring(0, 8)}...]: ${errMsg}`);
            }

            // If subscription expired, gone, or VAPID key mismatched (HTTP 410, 404, or 403), deactivate
            if (statusCode === 410 || statusCode === 404 || statusCode === 403) {
              expiredSubscriptions++;
              await db.updateDoc('push_subscriptions', docId, {
                active: false,
                expiredAt: Date.now(),
                failedAttempts: (sub.failedAttempts || 0) + 1,
                lastError: `Subscription invalid or mismatched (${statusCode}: ${errMsg})`
              });
            } else {
              // Other transient error: increment failed attempts
              await db.updateDoc('push_subscriptions', docId, {
                failedAttempts: (sub.failedAttempts || 0) + 1,
                lastError: errMsg
              });
            }
          }
        })
      );
    }

    return {
      totalEligible: activeSubs.length,
      attempts: activeSubs.length,
      acceptedByPushService,
      failed,
      expiredSubscriptions,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Admin: Dispatch custom broadcast (In-site banner and/or browser Web Push)
   */
  public async broadcast(params: {
    title: string;
    body: string;
    type: 'info' | 'important' | 'warning';
    url?: string;
    sendInSite: boolean;
    sendWebPush: boolean;
    adminInfo: { id: string; email: string };
    inSiteDispatcher?: (notification: any) => number;
  }): Promise<NotificationBroadcast> {
    const title = params.title.trim();
    const body = params.body.trim();
    if (!title || !body) throw new Error('Notification title and body are required.');

    let inSiteRecipients = 0;
    let pushBatchStats: DeliveryBatchStats = {
      totalEligible: 0,
      attempts: 0,
      acceptedByPushService: 0,
      failed: 0,
      expiredSubscriptions: 0
    };

    // 1. Dispatch In-Site via Socket.IO
    if (params.sendInSite && params.inSiteDispatcher) {
      inSiteRecipients = params.inSiteDispatcher({
        title,
        body,
        type: params.type,
        url: params.url || '/',
        timestamp: Date.now()
      });
    }

    // 2. Dispatch Web Push
    if (params.sendWebPush) {
      pushBatchStats = await this.dispatchWebPushBatch({
        title,
        body,
        url: params.url || '/',
        type: params.type,
        tag: `gamescope-admin-${Date.now()}`
      });
    }

    const broadcastRecord: NotificationBroadcast = {
      id: `bc-${Date.now()}`,
      title,
      body,
      type: params.type,
      url: params.url || '/',
      sendInSite: params.sendInSite,
      sendWebPush: params.sendWebPush,
      sentAt: Date.now(),
      sentBy: params.adminInfo.email,
      deliveryStats: {
        inSiteRecipients,
        totalEligible: pushBatchStats.totalEligible,
        pushAttempted: pushBatchStats.attempts,
        pushSuccessful: pushBatchStats.acceptedByPushService, // accepted by push service
        pushFailed: pushBatchStats.failed,
        expiredSubscriptions: pushBatchStats.expiredSubscriptions
      }
    };

    await db.setDoc('notification_history', broadcastRecord.id, broadcastRecord);

    await auditService.logAction({
      adminId: params.adminInfo.id,
      adminEmail: params.adminInfo.email,
      action: 'CUSTOM_BROADCAST_SENT',
      resourceId: broadcastRecord.id,
      newValue: broadcastRecord
    });

    return broadcastRecord;
  }

  public async getBroadcastHistory(limit: number = 20): Promise<NotificationBroadcast[]> {
    return db.getCollection<NotificationBroadcast>(
      'notification_history',
      undefined,
      (a, b) => b.sentAt - a.sentAt,
      limit
    );
  }
}

export const notificationService = NotificationService.getInstance();
