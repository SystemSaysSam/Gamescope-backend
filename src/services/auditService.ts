import { db } from './db';
import { AuditLog } from '../types';

export class AuditService {
  private static instance: AuditService;

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  public async logAction(params: {
    adminId: string;
    adminEmail: string;
    action: string;
    resourceId?: string;
    previousValue?: any;
    newValue?: any;
    ip?: string;
  }): Promise<AuditLog> {
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      adminId: params.adminId,
      adminEmail: params.adminEmail,
      action: params.action,
      resourceId: params.resourceId,
      previousValue: params.previousValue,
      newValue: params.newValue,
      timestamp: Date.now(),
      ip: params.ip
    };

    await db.setDoc('audit_logs', log.id, log);
    return log;
  }

  public async getRecentLogs(limit: number = 50): Promise<AuditLog[]> {
    return db.getCollection<AuditLog>(
      'audit_logs',
      undefined,
      (a, b) => b.timestamp - a.timestamp,
      limit
    );
  }
}

export const auditService = AuditService.getInstance();
