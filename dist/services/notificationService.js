"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.NotificationService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const web_push_1 = __importDefault(require("web-push"));
const db_1 = require("./db");
const auditService_1 = require("./auditService");
const env_1 = require("../config/env");
class NotificationService {
    static instance;
    constructor() {
        this.initWebPush();
    }
    static getInstance() {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }
    initWebPush() {
        try {
            web_push_1.default.setVapidDetails(env_1.env.VAPID.subject, env_1.env.VAPID.publicKey, env_1.env.VAPID.privateKey);
            console.log('[NotificationService] Web Push VAPID initialized successfully.');
        }
        catch (e) {
            console.warn('[NotificationService] Web Push VAPID warning:', e.message);
        }
    }
    getVapidPublicKey() {
        return env_1.env.VAPID.publicKey;
    }
    /**
     * Deterministic SHA-256 document ID for push endpoints
     */
    getSubscriptionDocId(endpoint) {
        return crypto_1.default.createHash('sha256').update(endpoint).digest('hex');
    }
    /**
     * Register or update a browser push subscription (Idempotent)
     */
    async subscribe(params) {
        const docId = this.getSubscriptionDocId(params.endpoint);
        const existing = await db_1.db.getDoc('push_subscriptions', docId);
        const now = Date.now();
        const record = {
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
        await db_1.db.setDoc('push_subscriptions', docId, record);
        console.log(`[NotificationService] Push subscription registered/updated: docId=${docId.substring(0, 12)}... (Active: true)`);
        return record;
    }
    /**
     * Unsubscribe a push endpoint
     */
    async unsubscribe(endpoint) {
        const docId = this.getSubscriptionDocId(endpoint);
        await db_1.db.updateDoc('push_subscriptions', docId, {
            active: false,
            unsubscribedAt: Date.now()
        });
    }
    /**
     * Get subscription counts & statistics
     */
    async getStats() {
        const all = await db_1.db.getCollection('push_subscriptions');
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
    async dispatchWebPushBatch(payload) {
        const activeSubs = await db_1.db.getCollection('push_subscriptions', (s) => s.active === true);
        const notificationPayload = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/assets/gta6poster.jpg',
            badge: payload.badge || '/favicon.svg',
            tag: payload.tag || `gamescope-${Date.now()}`,
            url: payload.url || '/gtavi',
            type: payload.type || 'info',
            timestamp: Date.now()
        });
        let acceptedByPushService = 0;
        let failed = 0;
        let expiredSubscriptions = 0;
        const errors = [];
        // Concurrency control: batches of 25 parallel requests
        const BATCH_SIZE = 25;
        for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
            const batch = activeSubs.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(batch.map(async (sub) => {
                try {
                    await web_push_1.default.sendNotification({
                        endpoint: sub.endpoint,
                        keys: sub.keys
                    }, notificationPayload);
                    acceptedByPushService++;
                    // Record successful delivery timestamp
                    const docId = sub.id || this.getSubscriptionDocId(sub.endpoint);
                    await db_1.db.updateDoc('push_subscriptions', docId, {
                        lastDeliveredAt: Date.now(),
                        failedAttempts: 0
                    });
                }
                catch (err) {
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
                        await db_1.db.updateDoc('push_subscriptions', docId, {
                            active: false,
                            expiredAt: Date.now(),
                            failedAttempts: (sub.failedAttempts || 0) + 1,
                            lastError: `Subscription invalid or mismatched (${statusCode}: ${errMsg})`
                        });
                    }
                    else {
                        // Other transient error: increment failed attempts
                        await db_1.db.updateDoc('push_subscriptions', docId, {
                            failedAttempts: (sub.failedAttempts || 0) + 1,
                            lastError: errMsg
                        });
                    }
                }
            }));
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
    async broadcast(params) {
        const title = params.title.trim();
        const body = params.body.trim();
        if (!title || !body)
            throw new Error('Notification title and body are required.');
        let inSiteRecipients = 0;
        let pushBatchStats = {
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
                url: params.url || '/gtavi',
                timestamp: Date.now()
            });
        }
        // 2. Dispatch Web Push
        if (params.sendWebPush) {
            pushBatchStats = await this.dispatchWebPushBatch({
                title,
                body,
                url: params.url || '/gtavi',
                type: params.type,
                tag: `gamescope-admin-${Date.now()}`
            });
        }
        const broadcastRecord = {
            id: `bc-${Date.now()}`,
            title,
            body,
            type: params.type,
            url: params.url || '/gtavi',
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
        await db_1.db.setDoc('notification_history', broadcastRecord.id, broadcastRecord);
        await auditService_1.auditService.logAction({
            adminId: params.adminInfo.id,
            adminEmail: params.adminInfo.email,
            action: 'CUSTOM_BROADCAST_SENT',
            resourceId: broadcastRecord.id,
            newValue: broadcastRecord
        });
        return broadcastRecord;
    }
    async getBroadcastHistory(limit = 20) {
        return db_1.db.getCollection('notification_history', undefined, (a, b) => b.sentAt - a.sentAt, limit);
    }
}
exports.NotificationService = NotificationService;
exports.notificationService = NotificationService.getInstance();
