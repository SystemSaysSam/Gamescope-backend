import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from './db';

export interface AdminPayload {
  adminId: string;
  email: string;
  role: 'superadmin' | 'admin' | 'moderator';
}

export class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Validates admin login via Firebase ID Token or Admin Secret Key
   */
  public async loginAdmin(params: {
    firebaseToken?: string;
    adminSecret?: string;
    email?: string;
  }): Promise<{ token: string; admin: AdminPayload }> {
    let email = params.email?.toLowerCase().trim() || '';
    let adminId = 'admin-master';
    let role: 'superadmin' | 'admin' | 'moderator' = 'admin';

    // 1. Check if Firebase ID Token is provided
    if (params.firebaseToken) {
      if (db.isUsingFirebase()) {
        try {
          const decoded = await admin.auth().verifyIdToken(params.firebaseToken);
          email = decoded.email?.toLowerCase().trim() || '';
          adminId = decoded.uid;
        } catch (err: any) {
          throw new Error(`Firebase token verification failed: ${err.message}`);
        }
      } else {
        // In local mode without active firebase credentials, accept the email if provided
        if (!email) {
          throw new Error('Email is required for authentication in local mode.');
        }
      }
    } else if (params.adminSecret) {
      // 2. Validate via master ADMIN_SECRET
      if (params.adminSecret !== env.ADMIN_SECRET) {
        throw new Error('Invalid administrative master secret.');
      }
      email = email || env.ADMIN_EMAILS[0] || 'admin@gamescope.live';
      role = 'superadmin';
    } else {
      throw new Error('Either firebaseToken or adminSecret must be provided.');
    }

    // 3. Verify email is in the admin allowlist
    const isAllowed = env.ADMIN_EMAILS.some(allowed => allowed === email || email.endsWith('@gamescope.live'));
    if (!isAllowed && role !== 'superadmin') {
      throw new Error(`Access denied. The email ${email} is not authorized for administration.`);
    }

    const adminPayload: AdminPayload = {
      adminId,
      email,
      role
    };

    const token = jwt.sign(adminPayload, env.JWT_SECRET, { expiresIn: '24h' });
    return { token, admin: adminPayload };
  }

  /**
   * Verifies an administrative JWT session token
   */
  public verifySessionToken(token: string): AdminPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AdminPayload;
      return decoded;
    } catch {
      throw new Error('Invalid or expired admin session token.');
    }
  }
}

export const authService = AuthService.getInstance();
