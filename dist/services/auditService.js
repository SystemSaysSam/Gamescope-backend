"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = exports.AuditService = void 0;
const db_1 = require("./db");
class AuditService {
    static instance;
    static getInstance() {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    }
    async logAction(params) {
        const log = {
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
        await db_1.db.setDoc('audit_logs', log.id, log);
        return log;
    }
    async getRecentLogs(limit = 50) {
        return db_1.db.getCollection('audit_logs', undefined, (a, b) => b.timestamp - a.timestamp, limit);
    }
}
exports.AuditService = AuditService;
exports.auditService = AuditService.getInstance();
