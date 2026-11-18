import { db } from './db';
import { auditService } from './auditService';
import { EmailSubscriber } from '../types';

export class EmailService {
  private static instance: EmailService;

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Register email subscriber
   */
  public async subscribe(params: { name: string; email: string; source?: string }): Promise<{
    success: boolean;
    alreadySubscribed?: boolean;
    subscriber: EmailSubscriber;
  }> {
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
    const existing = await db.getDoc<EmailSubscriber>('email_subscribers', docId);

    if (existing && existing.active) {
      return {
        success: true,
        alreadySubscribed: true,
        subscriber: existing
      };
    }

    const subscriber: EmailSubscriber = {
      id: docId,
      name,
      email,
      subscribedAt: Date.now(),
      active: true,
      source: params.source || 'footer_subscription',
      unsubscribeToken: Math.random().toString(36).substring(2, 15)
    };

    await db.setDoc('email_subscribers', docId, subscriber);
    return {
      success: true,
      alreadySubscribed: false,
      subscriber
    };
  }

  public async unsubscribe(emailOrToken: string): Promise<boolean> {
    const all = await db.getCollection<EmailSubscriber>('email_subscribers');
    const sub = all.find(s => s.email.toLowerCase() === emailOrToken.toLowerCase() || s.unsubscribeToken === emailOrToken);
    if (!sub) return false;

    await db.updateDoc('email_subscribers', sub.id, { active: false, unsubscribedAt: Date.now() });
    return true;
  }

  public async getSubscribers(search?: string): Promise<EmailSubscriber[]> {
    return db.getCollection<EmailSubscriber>(
      'email_subscribers',
      search
        ? (s) => s.email.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase())
        : undefined,
      (a, b) => b.subscribedAt - a.subscribedAt
    );
  }

  public async removeSubscriber(id: string, adminInfo: { id: string; email: string }): Promise<void> {
    const existing = await db.getDoc<EmailSubscriber>('email_subscribers', id);
    if (!existing) throw new Error('Subscriber not found.');

    await db.deleteDoc('email_subscribers', id);

    await auditService.logAction({
      adminId: adminInfo.id,
      adminEmail: adminInfo.email,
      action: 'REMOVE_EMAIL_SUBSCRIBER',
      resourceId: id,
      previousValue: existing
    });
  }

  public async exportSubscribersCsv(): Promise<string> {
    const subs = await this.getSubscribers();
    const rows = ['ID,Name,Email,SubscribedAt,Active,Source'];
    for (const s of subs) {
      const date = new Date(s.subscribedAt).toISOString();
      rows.push(`"${s.id}","${s.name.replace(/"/g, '""')}","${s.email}","${date}",${s.active},"${s.source}"`);
    }
    return rows.join('\n');
  }
}

export const emailService = EmailService.getInstance();
