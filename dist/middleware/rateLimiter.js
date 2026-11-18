"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
const ipBuckets = new Map();
const rateLimiter = (options) => {
    return (req, res, next) => {
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
exports.rateLimiter = rateLimiter;
// Periodic cleanup
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipBuckets.entries()) {
        if (now > record.resetAt) {
            ipBuckets.delete(ip);
        }
    }
}, 60000);
