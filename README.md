# Gamescope-backend

# GameScope Live — Production Backend & Admin Control Panel

A centralized, server-authoritative backend and administrative management interface built for the **GameScope Live** livestream event platform.

---

## 1. Architecture Overview

```
                         +----------------------------------+
                         |       GameScope Live Public       |
                         |   Frontend (React + Vite + TS)   |
                         +-----------------+----------------+
                                           |
                              REST / Socket.IO (Port 5000)
                                           |
+------------------------------+           v          +------------------------------+
|     Secure Admin Panel       | --->  [ BACKEND ] <--- |   Background Queue Worker    |
| (Vite + React + TailwindCSS) |       [ Cloud Run ]   | (Idempotent 15m push/remind) |
+------------------------------+              |        +------------------------------+
                                              |
                          +-------------------+-------------------+
                          |                                       |
                          v                                       v
                [ Firebase Firestore ]                 [ Web Push Service ]
             (Dual-mode: Cloud Firestore /            (VAPID Web Push RFC 8292
              Local file-backed JSON store)           + in-site realtime banner)
```

### Core Architectural Principles
1. **Server Authority**: The backend is the single source of truth for event state (`UPCOMING`, `STARTING`, `LIVE`, `BREAK`, `ENDED`), countdown targets, active stream IDs, live polls, and arcade scores.
2. **Zero Fake Metrics**: Website visitors represent measured active sockets. YouTube livestream viewers are marked strictly as `null` with operational explanations when Data API credentials are omitted.
3. **Dual-Mode Persistence**: Automatically connects to Google Cloud Firestore using `firebase-admin` when credentials are provided in `.env`. Gracefully falls back to a persistent atomic local store (`.data/gamescope_db.json`) in development or zero-credential environments.
4. **Arcade Anti-Cheat**: Runner runs are physics-validated on the server against the maximum attainable velocity ($v_{\max} = 64\text{ m/s}$). Any submission violating physical bounds is rejected with `SCORE_PLAUSIBILITY_FAILED`.
5. **Private Credentials**: Service account keys, JWT signing keys, VAPID private keys, and administrative secrets reside exclusively on the server.

---

## 2. Directory Structure

```
D:\Gamescope backend\
├── admin\                     # Dedicated Admin Panel (React 18 + Vite + TailwindCSS)
│   ├── src\
│   │   ├── components\tabs\   # 8 operational tabs (Overview, Event, Moderation, Polls, etc.)
│   │   ├── services\          # adminApi.ts, adminSocket.ts
│   │   ├── App.tsx            # Main shell with sidebar navigation & toast notifications
│   │   └── main.tsx
│   └── dist\                  # Built admin bundle (served by backend at /admin)
├── src\
│   ├── config\env.ts          # Zod-validated environment schema & fallbacks
│   ├── middleware\            # authMiddleware.ts, rateLimiter.ts
│   ├── routes\                # publicRoutes.ts, adminRoutes.ts
│   ├── services\              # eventService, chatService, arcadeService, etc.
│   ├── sockets\               # socketManager.ts (rooms, state broadcasts, lifecycle)
│   ├── types\index.ts         # Unified TypeScript interfaces
│   └── server.ts              # Express HTTP + Socket.IO server setup
├── test\verify.ts             # 20-test automated verification suite
├── firestore.rules            # Production Firestore security rules
├── firestore.indexes.json     # Compound query indexes
├── Dockerfile                 # Multi-stage production container build
├── .env.example               # Full template of environment variables
└── README.md
```

---

## 3. Environment Variables Reference

Create a `.env` file in the root directory (based on `.env.example`):

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP & WebSocket server port | `5000` |
| `NODE_ENV` | Runtime environment (`development` / `production`) | `development` |
| `CLIENT_ORIGIN` | Public frontend URL (CORS allowed) | `http://localhost:5173` |
| `ADMIN_ORIGIN` | Admin panel URL in development | `http://localhost:5174` |
| `JWT_SECRET` | Secret key used to sign admin session tokens | Required (min 32 chars) |
| `ADMIN_SECRET` | Master access secret for initial admin bootstrap | Required (min 16 chars) |
| `ADMIN_EMAILS` | Comma-delimited list of authorized admin emails | `admin@gamescope.live` |
| `VAPID_PUBLIC_KEY` | Public VAPID key for Web Push RFC 8292 | Auto-generated standard key |
| `VAPID_PRIVATE_KEY`| Private VAPID key for Web Push signing | Auto-generated standard key |
| `VAPID_SUBJECT` | Contact mailto or URL for Web Push authority | `mailto:contact@gamescope.live` |
| `FIREBASE_PROJECT_ID` | Google Cloud / Firebase Project ID | Optional (activates Firestore) |
| `FIREBASE_CLIENT_EMAIL`| Firebase Service Account client email | Optional |
| `FIREBASE_PRIVATE_KEY` | Firebase Service Account PEM private key | Optional |
| `YOUTUBE_API_KEY` | Google YouTube Data API v3 key | Optional (enables live viewer sync) |

---

## 4. REST API Documentation

### Public Endpoints
- `GET  /api/health` — System status, uptime, and database mode.
- `GET  /api/config/public` — Complete authoritative public event configuration.
- `GET  /api/config/assets` — Centralized asset URLs and base configuration.
- `GET  /api/chat/messages` — Paginated chat messages (ordered by timestamp).
- `POST /api/chat/messages` — Post a chat message (rate-limited, sanitized).
- `POST /api/chat/messages/:id/like` — Like a chat message.
- `POST /api/chat/messages/:id/reaction` — Send an emoji reaction (`🔥`, `⚡`, `💀`, `🎉`).
- `GET  /api/polls/active` — Active live poll and current percentage breakdown.
- `POST /api/polls/:id/vote` — Submit or toggle vote on an active poll.
- `POST /api/arcade/session/start` — Start a server-validated arcade session.
- `POST /api/arcade/session/heartbeat` — Runner heartbeat ping.
- `POST /api/arcade/session/submit` — Submit final score with physics validation.
- `GET  /api/arcade/leaderboard` — Top verified scores and player ranks.
- `POST /api/subscriptions/push` — Register browser Web Push subscription.
- `POST /api/subscriptions/email` — Submit email subscription for event updates.
- `POST /api/subscriptions/email/unsubscribe` — Cancel email subscription.

### Protected Admin Endpoints (`Authorization: Bearer <token>`)
- `POST /api/admin/auth/login` — Exchange master secret or Firebase ID token for admin JWT.
- `GET  /api/admin/auth/me` — Verify active admin session.
- `POST /api/admin/event/state` — Transition event state (`UPCOMING`, `STARTING`, `LIVE`, `BREAK`, `ENDED`).
- `POST /api/admin/event/countdown` — Update countdown target ISO, timezone, and label.
- `POST /api/admin/event/stream` — Update stream URL and extract YouTube Video ID.
- `POST /api/admin/event/inactive-screen` — Update editable headline, description, and secondary text.
- `POST /api/admin/event/force-sync` — Increment configuration version and force client sync.
- `POST /api/admin/chat/messages/:id/pin` — Pin chat message.
- `DELETE /api/admin/chat/pin` — Unpin active announcement.
- `POST /api/admin/chat/users/:id/timeout` — Temporarily mute abusive user (e.g., 300s).
- `POST /api/admin/chat/users/:id/ban` — Permanently ban abusive user from chat.
- `DELETE /api/admin/chat/messages/:id` — Soft-delete abusive message.
- `POST /api/admin/polls` — Create and open a live poll.
- `POST /api/admin/polls/:id/close` — Close poll and freeze voting.
- `POST /api/admin/notifications/broadcast` — Dispatch instant in-site or Web Push broadcast.
- `GET  /api/admin/analytics` — Real measured visitor metrics, chat activity, and queue health.
- `GET  /api/admin/email-subscribers` — List email subscribers with CSV export.
- `GET  /api/admin/audit-logs` — Immutable audit trail of administrative modifications.

---

## 5. Realtime Socket.IO Events

### Client -> Server
- `chat:join` — Join chat room with client identification.
- `chat:typing` — Ephemeral typing notification.
- `arcade:heartbeat` — Active session keep-alive.

### Server -> Client (Broadcast)
- `event:state_change` — Authoritative event state update payload.
- `event:countdown_update` — Synchronized countdown target and timezone.
- `event:stream_update` — YouTube Video ID and stream URL changes.
- `event:inactive_screen_update` — Inactive conclusion headline and copy.
- `event:force_sync` — Instruction for client to invalidate cache and refresh config.
- `chat:message` — New incoming chat message.
- `chat:like` — Message like count update.
- `chat:reaction` — Floating emoji reaction event.
- `chat:pin` — Pinned announcement banner payload.
- `chat:message_deleted` — Instruction to remove message from view.
- `poll:update` — Poll options vote counts and percentages.
- `arcade:leaderboard_update` — Updated top runs.
- `notification:broadcast` — In-site banner broadcast message.
- `analytics:visitor_count` — Real measured connected viewer tally.

---

## 6. Event State Machine & Frontend Behavior

| Event State | Main Media Area | Arcade Access | Background Music | Chat |
|---|---|---|---|---|
| **`UPCOMING`** | Cinematic Pre-Stream & Dynamic Countdown | Accessible via Arcade modal/tab | Plays if user enabled | Active |
| **`STARTING`** | "Starting Soon" alert / pre-roll | Terminated & locked | Fades to 0 over 2-3s | Active |
| **`LIVE`** | YouTube Livestream Embed Player | Hidden & locked | Muted | Active |
| **`BREAK`** | Vice City Run Arcade Game | Prominently displayed | Restores user preference | Active |
| **`ENDED`** | Editable Inactive Screen message | Inactive / locked | Restores user preference | Active |

---

## 7. Google Cloud Run Deployment

### Option A: Automated Build with Google Cloud Build
```bash
# 1. Authenticate with Google Cloud
gcloud auth login
gcloud config set project [YOUR_PROJECT_ID]

# 2. Build and push container to Google Artifact Registry
gcloud builds submit --tag gcr.io/[YOUR_PROJECT_ID]/gamescope-backend:latest .

# 3. Deploy to Cloud Run
gcloud run deploy gamescope-backend \
  --image gcr.io/[YOUR_PROJECT_ID]/gamescope-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,CLIENT_ORIGIN=https://gamescope.live" \
  --set-secrets "JWT_SECRET=gamescope-jwt:latest,ADMIN_SECRET=gamescope-admin-secret:latest"
```

### Option B: Local Docker Build & Test
```bash
# Build multi-stage image
docker build -t gamescope-backend:latest .

# Run container locally
docker run -p 5000:8080 --env-file .env gamescope-backend:latest
```

---

## 8. Verification & Testing

The backend includes a comprehensive 20-assertion automated test suite covering all operational modules:

```bash
# Run verification test suite
npm test
# Or using npx tsx directly:
npx tsx test/verify.ts
```
