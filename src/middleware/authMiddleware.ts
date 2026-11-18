import { Request, Response, NextFunction } from 'express';
import { authService, AdminPayload } from '../services/auth';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
  admin?: AdminPayload;
}

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const adminSecretHeader = req.headers['x-admin-secret'];

    // 1. Check Direct Secret Header
    if (adminSecretHeader && typeof adminSecretHeader === 'string' && adminSecretHeader === env.ADMIN_SECRET) {
      req.admin = {
        adminId: 'admin-secret-user',
        email: env.ADMIN_EMAILS[0] || 'admin@gamescope.live',
        role: 'superadmin'
      };
      return next();
    }

    // 2. Check Bearer Token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Administrative authentication token required.' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = authService.verifySessionToken(token);
    req.admin = payload;
    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Unauthorized: Invalid administrative credentials.' });
  }
};
