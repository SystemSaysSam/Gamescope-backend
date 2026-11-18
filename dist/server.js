"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./config/env");
const socketManager_1 = require("./sockets/socketManager");
const publicRoutes_1 = require("./routes/publicRoutes");
const adminRoutes_1 = require("./routes/adminRoutes");
const eventService_1 = require("./services/eventService");
const chatService_1 = require("./services/chatService");
const pollService_1 = require("./services/pollService");
const arcadeService_1 = require("./services/arcadeService");
const reminderScheduler_1 = require("./services/reminderScheduler");
const identityService_1 = require("./services/identityService");
const youtubeChatService_1 = require("./services/youtubeChatService");
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
// Initialize Socket.IO
socketManager_1.socketManager.init(server);
// Middleware
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (env_1.env.CORS_ORIGINS.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
            return callback(null, true);
        }
        return callback(null, true); // Dev permissive
    },
    credentials: true
}));
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// Logging middleware
app.use((req, res, next) => {
    if (env_1.env.NODE_ENV !== 'test' && !req.path.includes('/analytics/ping')) {
        console.log(`[HTTP] ${req.method} ${req.path} - ${new Date().toISOString()}`);
    }
    next();
});
// API Routes
app.use('/api', publicRoutes_1.publicRoutes);
app.use('/api/admin', adminRoutes_1.adminRoutes);
// Serve Admin Frontend static build if present
const adminDistPath = path_1.default.resolve(__dirname, '..', 'admin', 'dist');
if (fs_1.default.existsSync(adminDistPath)) {
    app.use('/admin', express_1.default.static(adminDistPath));
    app.get('/admin', (req, res) => {
        res.sendFile(path_1.default.join(adminDistPath, 'index.html'));
    });
    app.get('/admin/*', (req, res) => {
        res.sendFile(path_1.default.join(adminDistPath, 'index.html'));
    });
    console.log(`[Server] Serving Admin Panel from ${adminDistPath}`);
}
// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});
// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({
        error: err.message || 'Internal server error occurred.',
        timestamp: Date.now()
    });
});
async function startServer() {
    try {
        await eventService_1.eventService.init();
        await chatService_1.chatService.init();
        await pollService_1.pollService.init();
        await arcadeService_1.arcadeService.init();
        await reminderScheduler_1.reminderScheduler.init();
        await identityService_1.identityService.init();
        await youtubeChatService_1.youtubeChatService.init();
        if (server.listening) {
            return server;
        }
        return new Promise((resolve, reject) => {
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`[Server] Port ${env_1.env.PORT} already active. Connecting to running instance.`);
                    resolve(server);
                }
                else {
                    reject(err);
                }
            });
            server.listen(env_1.env.PORT, () => {
                console.log(`=======================================================`);
                console.log(`  GAMESCOPE LIVE — PRODUCTION BACKEND`);
                console.log(`  Port:             http://localhost:${env_1.env.PORT}`);
                console.log(`  Environment:      ${env_1.env.NODE_ENV}`);
                console.log(`  Public Client:    ${env_1.env.CLIENT_URL}/gtavi`);
                console.log(`  Admin Panel:      ${env_1.env.ADMIN_URL}`);
                console.log(`  CORS Allowed:     ${env_1.env.CORS_ORIGINS.join(', ')}`);
                console.log(`=======================================================`);
                resolve(server);
            });
        });
    }
    catch (err) {
        console.error('[Server] Critical startup failure:', err);
        process.exit(1);
    }
}
// Graceful Shutdown
const handleShutdown = () => {
    console.log('\n[Server] Gracefully shutting down...');
    server.close(() => {
        console.log('[Server] HTTP and WebSocket listeners closed.');
        process.exit(0);
    });
};
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
if (process.env.NODE_ENV !== 'test' && !process.argv.some(a => a.includes('verify'))) {
    startServer();
}
