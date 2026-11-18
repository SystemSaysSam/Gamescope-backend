"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = exports.EmailService = void 0;
const db_1 = require("./db");
const auditService_1 = require("./auditService");
class EmailService {
    static instance;
    static getInstance() {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }
    /**
     * Register email subscriber
     */
    async subscribe(params) {
        const name = params.name.trim();
        const email = params.email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Please enter a valid email address.');
        }
        if (!name) {
            throw new Error('Name is required.');
        }
        const docId = Buffer.from(email).toString('base64url').substring(0, 80);
        const existing = await db_1.db.getDoc('email_subscribers', docId);
        if (existing && existing.active) {
            return {
                success: true,
                alreadySubscribed: true,
                subscriber: existing
            };
        }
        const subscriber = {
            id: docId,
            name,
            email,
            subscribedAt: Date.now(),
            active: true,
            source: params.source || 'footer_subscription',
            unsubscribeToken: Math.random().toString(36).substring(2, 15)
        };
        await db_1.db.setDoc('email_subscribers', docId, subscriber);
        return {
            success: true,
            alreadySubscribed: false,
            subscriber
        };
    }
    async unsubscribe(emailOrToken) {
        const all = await db_1.db.getCollection('email_subscribers');
        const sub = all.find(s => s.email.toLowerCase() === emailOrToken.toLowerCase() || s.unsubscribeToken === emailOrToken);
        if (!sub)
            return false;
        await db_1.db.updateDoc('email_subscribers', sub.id, { active: false, unsubscribedAt: Date.now() });
        return true;
    }
    async getSubscribers(search) {
        return db_1.db.getCollection('email_subscribers', search
            ? (s) => s.email.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase())
            : undefined, (a, b) => b.subscribedAt - a.subscribedAt);
    }
    async removeSubscriber(id, adminInfo) {
        const existing = await db_1.db.getDoc('email_subscribers', id);
        if (!existing)
            throw new Error('Subscriber not found.');
        await db_1.db.deleteDoc('email_subscribers', id);
        await auditService_1.auditService.logAction({
            adminId: adminInfo.id,
            adminEmail: adminInfo.email,
            action: 'REMOVE_EMAIL_SUBSCRIBER',
            resourceId: id,
            previousValue: existing
        });
    }
    async exportSubscribersCsv() {
        const subs = await this.getSubscribers();
        const rows = ['ID,Name,Email,SubscribedAt,Active,Source'];
        for (const s of subs) {
            const date = new Date(s.subscribedAt).toISOString();
            rows.push(`"${s.id}","${s.name.replace(/"/g, '""')}","${s.email}","${date}",${s.active},"${s.source}"`);
        }
        return rows.join('\n');
    }
}
exports.EmailService = EmailService;
exports.emailService = EmailService.getInstance();
