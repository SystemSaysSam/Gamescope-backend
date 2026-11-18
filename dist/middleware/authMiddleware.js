"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const auth_1 = require("../services/auth");
const env_1 = require("../config/env");
const requireAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const adminSecretHeader = req.headers['x-admin-secret'];
        // 1. Check Direct Secret Header
        if (adminSecretHeader && typeof adminSecretHeader === 'string' && adminSecretHeader === env_1.env.ADMIN_SECRET) {
            req.admin = {
                adminId: 'admin-secret-user',
                email: env_1.env.ADMIN_EMAILS[0] || 'admin@gamescope.live',
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
        const payload = auth_1.authService.verifySessionToken(token);
        req.admin = payload;
        next();
    }
    catch (err) {
        res.status(401).json({ error: err.message || 'Unauthorized: Invalid administrative credentials.' });
    }
};
exports.requireAdmin = requireAdmin;
