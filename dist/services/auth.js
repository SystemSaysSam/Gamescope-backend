"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const db_1 = require("./db");
class AuthService {
    static instance;
    static getInstance() {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }
    /**
     * Validates admin login via Firebase ID Token or Admin Secret Key
     */
    async loginAdmin(params) {
        let email = params.email?.toLowerCase().trim() || '';
        let adminId = 'admin-master';
        let role = 'admin';
        // 1. Check if Firebase ID Token is provided
        if (params.firebaseToken) {
            if (db_1.db.isUsingFirebase()) {
                try {
                    const decoded = await firebase_admin_1.default.auth().verifyIdToken(params.firebaseToken);
                    email = decoded.email?.toLowerCase().trim() || '';
                    adminId = decoded.uid;
                }
                catch (err) {
                    throw new Error(`Firebase token verification failed: ${err.message}`);
                }
            }
            else {
                // In local mode without active firebase credentials, accept the email if provided
                if (!email) {
                    throw new Error('Email is required for authentication in local mode.');
                }
            }
        }
        else if (params.adminSecret) {
            // 2. Validate via master ADMIN_SECRET
            if (params.adminSecret !== env_1.env.ADMIN_SECRET) {
                throw new Error('Invalid administrative master secret.');
            }
            email = email || env_1.env.ADMIN_EMAILS[0] || 'admin@gamescope.live';
            role = 'superadmin';
        }
        else {
            throw new Error('Either firebaseToken or adminSecret must be provided.');
        }
        // 3. Verify email is in the admin allowlist
        const isAllowed = env_1.env.ADMIN_EMAILS.some(allowed => allowed === email || email.endsWith('@gamescope.live'));
        if (!isAllowed && role !== 'superadmin') {
            throw new Error(`Access denied. The email ${email} is not authorized for administration.`);
        }
        const adminPayload = {
            adminId,
            email,
            role
        };
        const token = jsonwebtoken_1.default.sign(adminPayload, env_1.env.JWT_SECRET, { expiresIn: '24h' });
        return { token, admin: adminPayload };
    }
    /**
     * Verifies an administrative JWT session token
     */
    verifySessionToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
            return decoded;
        }
        catch {
            throw new Error('Invalid or expired admin session token.');
        }
    }
}
exports.AuthService = AuthService;
exports.authService = AuthService.getInstance();
