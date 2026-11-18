import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateLimitRecord>();

export const rateLimiter = (options: { windowMs: number; max: number; message?: string }) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = ipBuckets.get(ip);
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + options.windowMs };
      ipBuckets.set(ip, record);
      return next();
    }

    record.count++;
    if (record.count > options.max) {
      res.status(429).json({
        error: options.message || 'Too many requests. Please slow down and try again later.'
      });
      return;
    }

    next();
  };
};

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipBuckets.entries()) {
    if (now > record.resetAt) {
      ipBuckets.delete(ip);
    }
  }
}, 60000);
