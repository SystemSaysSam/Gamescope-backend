"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
exports.env = {
    PORT: parseInt(process.env.PORT || '5000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    isProd: process.env.NODE_ENV === 'production',
    // Allowed CORS Origins (Client frontend & Admin frontend)
    CLIENT_URL: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://live.5tart.sbs' : 'http://localhost:5174'),
    ADMIN_URL: process.env.ADMIN_URL || (process.env.NODE_ENV === 'production' ? 'https://gamescopeserver.5tart.sbs' : 'http://localhost:5000'),
    CORS_ORIGINS: (process.env.CORS_ORIGINS || 'https://live.5tart.sbs,https://gamescopeserver.5tart.sbs,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5000')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    // Admin Security & Allowlist
    ADMIN_SECRET: process.env.ADMIN_SECRET || 'gamescope_admin_master_secret_2026',
    JWT_SECRET: process.env.JWT_SECRET || 'gamescope_jwt_secure_session_token_key_leonida',
    ADMIN_EMAILS: (process.env.ADMIN_EMAILS || 'admin@gamescope.live,producer@gamescope.live,director@gamescope.live')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean),
    // Firebase Admin SDK Configuration
    FIREBASE: {
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    },
    // Web Push (VAPID) Credentials
    VAPID: {
        publicKey: process.env.VAPID_PUBLIC_KEY || 'BILYFQOGxZH2AL1jRHABY3nuiZYjzCdKUUjSVTSFI_biD8hvsaoPuC0aFrCkQlUu79fUyxsahNp-7loeCT8clbM',
        privateKey: process.env.VAPID_PRIVATE_KEY || 'YSWYQ0hN4OVuuVQPiREnQ15OFaom213g_xFx0rvZDvY',
        subject: process.env.VAPID_SUBJECT || 'mailto:contact@gamescope.live'
    },
    // Event Defaults
    DEFAULT_EVENT_ID: process.env.DEFAULT_EVENT_ID || 'gta-vi-premiere-2026',
    DEFAULT_YOUTUBE_VIDEO_ID: process.env.DEFAULT_YOUTUBE_VIDEO_ID || 'QdBZY2fkU-0',
    // YouTube Live Chat Integration
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
    YOUTUBE_DEFAULT_VIDEO_ID: process.env.YOUTUBE_DEFAULT_VIDEO_ID || 'BGUTv2K_SWs',
    YOUTUBE_CHAT_IMPORT_ENABLED: process.env.YOUTUBE_CHAT_IMPORT_ENABLED !== 'false',
};
