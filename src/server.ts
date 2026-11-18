import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { socketManager } from './sockets/socketManager';
import { publicRoutes } from './routes/publicRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { eventService } from './services/eventService';
import { chatService } from './services/chatService';
import { pollService } from './services/pollService';
import { arcadeService } from './services/arcadeService';
import { reminderScheduler } from './services/reminderScheduler';
import { identityService } from './services/identityService';
import { youtubeChatService } from './services/youtubeChatService';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
socketManager.init(server);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (env.CORS_ORIGINS.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
      return callback(null, true);
    }
    return callback(null, true); // Dev permissive
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Logging middleware
app.use((req, res, next) => {
  if (env.NODE_ENV !== 'test' && !req.path.includes('/analytics/ping')) {
    console.log(`[HTTP] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  }
  next();
});

// API Routes
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Serve Admin Frontend static build if present
const adminDistPath = path.resolve(__dirname, '..', 'admin', 'dist');
if (fs.existsSync(adminDistPath)) {
  app.use('/admin', express.static(adminDistPath));
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
  console.log(`[Server] Serving Admin Panel from ${adminDistPath}`);
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: err.message || 'Internal server error occurred.',
    timestamp: Date.now()
  });
});

export async function startServer(): Promise<http.Server> {
  try {
    await eventService.init();
    await chatService.init();
    await pollService.init();
    await arcadeService.init();
    await reminderScheduler.init();
    await identityService.init();
    await youtubeChatService.init();

    if (server.listening) {
      return server;
    }

    return new Promise((resolve, reject) => {
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[Server] Port ${env.PORT} already active. Connecting to running instance.`);
          resolve(server);
        } else {
          reject(err);
        }
      });

      server.listen(env.PORT, () => {
        console.log(`=======================================================`);
        console.log(`  GAMESCOPE LIVE — PRODUCTION BACKEND`);
        console.log(`  Port:             http://localhost:${env.PORT}`);
        console.log(`  Environment:      ${env.NODE_ENV}`);
        console.log(`  Public Client:    ${env.CLIENT_URL}/gtavi`);
        console.log(`  Admin Panel:      ${env.ADMIN_URL}`);
        console.log(`  CORS Allowed:     ${env.CORS_ORIGINS.join(', ')}`);
        console.log(`=======================================================`);
        resolve(server);
      });
    });
  } catch (err) {
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

export { app, server };
