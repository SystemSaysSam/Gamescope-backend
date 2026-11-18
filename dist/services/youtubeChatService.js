"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.youtubeChatService = exports.YouTubeChatService = void 0;
exports.extractYouTubeVideoId = extractYouTubeVideoId;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const env_1 = require("../config/env");
const identityService_1 = require("./identityService");
const adaptiveAudienceController_1 = require("./adaptiveAudienceController");
const queueService_1 = require("./queueService");
const socketManager_1 = require("../sockets/socketManager");
const auditService_1 = require("./auditService");
function extractYouTubeVideoId(input) {
    if (!input)
        return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
}
class YouTubeChatService {
    static instance;
    instanceId;
    isRunning = false;
    loopTimer = null;
    nextPageToken = null;
    // Delayed, Continuous Polling Timing (Requirement 1 & 2)
    configuredPollingIntervalMs = 60000;
    youtubePollingIntervalMs = 0;
    effectivePollingIntervalMs = 60000;
    processedMessageIds = new Set();
    currentPoll = null;
    // Custom Alternative YouTube Poll Stream Source
    customPollVideoId = null;
    customPollLiveChatId = null;
    customPollStatus = 'IDLE';
    customPollLastError = null;
    customPollLastSyncedAt = null;
    customPollPageToken = null;
    // Ingestion State & Telemetry
    state = {
        selectedVideoId: '',
        videoIdSource: 'NONE',
        liveChatId: null,
        status: 'NOT_CONFIGURED',
        reconnectAttempts: 0,
        importedMessageCount: 0,
        uniqueParticipantCount: 0,
        activePoll: null,
        nextPageToken: null,
        configuredPollingIntervalSeconds: 60,
        effectivePollingIntervalSeconds: 60,
        quotaDay: new Date().toISOString().slice(0, 10),
        quotaUsedToday: 0,
        quotaDailyBudget: 10000,
        requestsToday: 0,
        estimatedDailyCost: 7200,
        isQuotaExhausted: false,
        lastSuccessfulFetch: undefined,
        lastImportedMessage: null
    };
    constructor() {
        this.instanceId = `node-yt-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
        // Clean deduplication cache every 10 minutes
        setInterval(() => {
            if (this.processedMessageIds.size > 20000) {
                this.processedMessageIds.clear();
            }
        }, 600000);
    }
    static getInstance() {
        if (!YouTubeChatService.instance) {
            YouTubeChatService.instance = new YouTubeChatService();
        }
        return YouTubeChatService.instance;
    }
    /**
     * Initialize service on server boot
     */
    async init() {
        console.log(`[YouTubeChatService] Initializing YouTube Live Chat Service (Instance: ${this.instanceId})...`);
        // 1. Initialize identity service & adaptive controller
        await identityService_1.identityService.init();
        await adaptiveAudienceController_1.adaptiveAudienceController.init();
        // 2. Load previous ingestion state from database if available (Persistence & Recovery after restart)
        const savedState = await db_1.db.getDoc('site_config', 'youtube_ingestion_state');
        if (savedState) {
            this.state.importedMessageCount = savedState.importedMessageCount || 0;
            this.state.uniqueParticipantCount = savedState.uniqueParticipantCount || 0;
            this.state.quotaDay = savedState.quotaDay || new Date().toISOString().slice(0, 10);
            this.state.quotaUsedToday = savedState.quotaUsedToday || 0;
            this.state.requestsToday = savedState.requestsToday || 0;
            this.state.isQuotaExhausted = Boolean(savedState.isQuotaExhausted);
            this.state.quotaExhaustedAt = savedState.quotaExhaustedAt;
            this.state.lastSuccessfulFetch = savedState.lastSuccessfulFetch;
            this.state.lastImportedMessage = savedState.lastImportedMessage || null;
            // Recover continuation token & liveChatId if stream matches
            if (savedState.selectedVideoId && savedState.liveChatId) {
                this.state.selectedVideoId = savedState.selectedVideoId;
                this.state.liveChatId = savedState.liveChatId;
                this.nextPageToken = savedState.nextPageToken || null;
                this.state.nextPageToken = this.nextPageToken;
                console.log(`[YouTubeChatService] Restored saved liveChatId [${savedState.liveChatId.substring(0, 10)}...] and continuation token [${this.nextPageToken ? this.nextPageToken.substring(0, 10) + '...' : 'none'}]`);
            }
        }
        // 3. Resolve active video ID
        await this.resolveSelectedVideoId();
        // 3b. Load saved custom poll stream if configured
        try {
            const savedCustomPoll = await db_1.db.getDoc('site_config', 'youtube_custom_poll');
            if (savedCustomPoll?.customPollVideoId) {
                this.customPollVideoId = savedCustomPoll.customPollVideoId;
                this.state.customPollVideoId = savedCustomPoll.customPollVideoId;
                console.log(`[YouTubeChatService] Restored custom poll stream video ID: '${this.customPollVideoId}'`);
            }
        }
        catch { }
        // 4. Update initial telemetry intervals
        this.refreshTelemetryIntervals();
        // 5. Start ingestion lifecycle
        this.startLifecycle();
    }
    /**
     * Recalculate configured and effective polling intervals (Requirement 1)
     * The actual interval must always be:
     * MAX(configured minimum interval, YouTube pollingIntervalMillis)
     */
    refreshTelemetryIntervals() {
        const config = adaptiveAudienceController_1.adaptiveAudienceController.getConfig();
        const configuredSec = config.pollingIntervalSeconds && config.pollingIntervalSeconds >= 5
            ? config.pollingIntervalSeconds
            : 60;
        this.configuredPollingIntervalMs = configuredSec * 1000;
        // MAX(configured minimum interval, YouTube pollingIntervalMillis)
        this.effectivePollingIntervalMs = Math.max(this.configuredPollingIntervalMs, this.youtubePollingIntervalMs || 0);
        this.state.configuredPollingIntervalSeconds = configuredSec;
        this.state.effectivePollingIntervalSeconds = Math.round(this.effectivePollingIntervalMs / 1000);
        this.state.quotaDailyBudget = config.quotaDailyBudget || 10000;
        // Estimated units/day = (86400 / intervalSec) * 5 units
        this.state.estimatedDailyCost = Math.round((86400 / (this.effectivePollingIntervalMs / 1000)) * 5);
        return this.effectivePollingIntervalMs;
    }
    /**
     * Record API quota consumption & enforce budget limit (Requirement 4)
     */
    recordQuotaUsage(cost) {
        const todayUtc = new Date().toISOString().slice(0, 10);
        if (this.state.quotaDay !== todayUtc) {
            // Midnight UTC rollover: reset daily usage
            console.log(`[YouTubeChatService] Daily UTC rollover (${this.state.quotaDay} -> ${todayUtc}). Resetting daily quota counters.`);
            this.state.quotaDay = todayUtc;
            this.state.quotaUsedToday = 0;
            this.state.requestsToday = 0;
            this.state.isQuotaExhausted = false;
            this.state.quotaExhaustedAt = undefined;
        }
        this.state.requestsToday = (this.state.requestsToday || 0) + 1;
        this.state.quotaUsedToday = (this.state.quotaUsedToday || 0) + cost;
        const config = adaptiveAudienceController_1.adaptiveAudienceController.getConfig();
        const budget = config.quotaDailyBudget || 10000;
        if (this.state.quotaUsedToday >= budget && !this.state.isQuotaExhausted) {
            this.state.isQuotaExhausted = true;
            this.state.quotaExhaustedAt = Date.now();
            this.updateStatus('QUOTA_EXHAUSTED', `Configured daily quota limit of ${budget} units reached.`);
        }
        this.state.quotaDailyBudget = budget;
        this.state.estimatedDailyCost = Math.round((86400 / (this.effectivePollingIntervalMs / 1000)) * 5);
    }
    /**
     * Trigger quota exhaustion manually or via upstream quota error
     */
    triggerQuotaExhaustion(reason = 'Daily quota limit reached') {
        this.state.isQuotaExhausted = true;
        this.state.quotaExhaustedAt = Date.now();
        this.updateStatus('QUOTA_EXHAUSTED', reason);
    }
    /**
     * Admin: Reset quota exhausted status manually (Requirement 4)
     */
    async resetQuotaStatus(adminEmail) {
        console.log(`[YouTubeChatService] Admin ${adminEmail} requested manual quota status reset.`);
        this.state.isQuotaExhausted = false;
        this.state.quotaExhaustedAt = undefined;
        this.state.quotaUsedToday = 0;
        this.state.requestsToday = 0;
        this.updateStatus('CONNECTED', null);
        await auditService_1.auditService.logAction({
            adminId: 'admin',
            adminEmail,
            action: 'RESET_YOUTUBE_QUOTA_STATUS'
        });
        // Trigger immediate execution
        this.step().catch(() => { });
        return this.getState();
    }
    /**
     * Video Selection Priority:
     * 1. Admin Panel configured video ID
     * 2. YOUTUBE_DEFAULT_VIDEO_ID as fallback when no Admin Panel video ID exists
     */
    async resolveSelectedVideoId() {
        const config = adaptiveAudienceController_1.adaptiveAudienceController.getConfig();
        const adminVideoId = config.videoId ? config.videoId.trim() : '';
        if (adminVideoId) {
            const valid = this.isValidVideoId(adminVideoId);
            if (!valid) {
                this.updateStatus('API_ERROR', `Configured Admin Video ID '${adminVideoId}' is invalid.`);
                this.state.selectedVideoId = adminVideoId;
                this.state.videoIdSource = 'ADMIN';
                return { videoId: adminVideoId, source: 'ADMIN' };
            }
            if (this.state.selectedVideoId && this.state.selectedVideoId !== adminVideoId) {
                adaptiveAudienceController_1.adaptiveAudienceController.startNewStreamSession(adminVideoId);
            }
            this.state.selectedVideoId = adminVideoId;
            this.state.streamSessionId = adaptiveAudienceController_1.adaptiveAudienceController.getStreamSessionId();
            this.state.videoIdSource = 'ADMIN';
            return { videoId: adminVideoId, source: 'ADMIN' };
        }
        // Fallback to environment default
        const envDefault = (env_1.env.YOUTUBE_DEFAULT_VIDEO_ID || '').trim();
        if (envDefault && this.isValidVideoId(envDefault)) {
            if (this.state.selectedVideoId && this.state.selectedVideoId !== envDefault) {
                adaptiveAudienceController_1.adaptiveAudienceController.startNewStreamSession(envDefault);
            }
            this.state.selectedVideoId = envDefault;
            this.state.streamSessionId = adaptiveAudienceController_1.adaptiveAudienceController.getStreamSessionId();
            this.state.videoIdSource = 'ENVIRONMENT';
            return { videoId: envDefault, source: 'ENVIRONMENT' };
        }
        this.state.selectedVideoId = '';
        this.state.videoIdSource = 'NONE';
        this.updateStatus('NOT_CONFIGURED', 'No valid YouTube livestream video ID is configured.');
        return { videoId: '', source: 'NONE' };
    }
    isValidVideoId(id) {
        if (!id)
            return false;
        return /^[a-zA-Z0-9_-]{11}$/.test(id.trim());
    }
    getState() {
        this.refreshTelemetryIntervals();
        return {
            ...this.state,
            activePoll: this.currentPoll,
            customPollVideoId: this.customPollVideoId,
            customPollLiveChatId: this.customPollLiveChatId,
            customPollStatus: this.customPollStatus,
            customPollLastError: this.customPollLastError,
            customPollLastSyncedAt: this.customPollLastSyncedAt
        };
    }
    updateStatus(status, error) {
        this.state.status = status;
        this.state.lastError = error !== undefined ? error : this.state.lastError;
        this.state.lastConnectionAttempt = Date.now();
        this.state.nextPageToken = this.nextPageToken;
        // Broadcast status to Admin Panel via Socket.IO
        socketManager_1.socketManager.broadcast('youtube:status_update', this.state);
        db_1.db.setDoc('site_config', 'youtube_ingestion_state', this.state).catch(() => { });
    }
    /**
     * Continuous Polling Worker (Requirement 2 & 3)
     * Single timer per active livestream, resumes from last continuation token, drains backlogs.
     */
    startLifecycle() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        const runLoop = async () => {
            let nextDelayMs = this.refreshTelemetryIntervals();
            try {
                const stepResult = await this.step();
                // If there is an extensive backlog to catch up (Requirement 3)
                if (stepResult && stepResult.hasMoreBacklog && !this.state.isQuotaExhausted) {
                    // Rapid catch-up cycle (5 seconds) to drain backlog safely
                    nextDelayMs = Math.min(5000, nextDelayMs);
                    console.log(`[YouTubeChatService] Catch-up draining in progress (${stepResult.importedCount} imported). Next batch in ${nextDelayMs / 1000}s...`);
                }
            }
            catch (err) {
                console.error('[YouTubeChatService] Loop iteration error:', err.message);
                // Exponential backoff on unexpected error
                nextDelayMs = Math.min(nextDelayMs * 1.5, 120000);
            }
            finally {
                if (this.isRunning) {
                    if (this.loopTimer)
                        clearTimeout(this.loopTimer);
                    this.loopTimer = setTimeout(runLoop, nextDelayMs);
                }
            }
        };
        runLoop();
        console.log(`[YouTubeChatService] Delayed continuous ingestion loop started (Polling delay: ${this.state.effectivePollingIntervalSeconds}s).`);
    }
    stopLifecycle() {
        this.isRunning = false;
        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }
    }
    /**
     * Main execution step (Discover -> Connect -> Ingest)
     */
    async step() {
        const config = adaptiveAudienceController_1.adaptiveAudienceController.getConfig();
        // Check if imports globally disabled by admin
        if (!config.importEnabled) {
            if (this.state.status !== 'IMPORT_DISABLED') {
                this.updateStatus('IMPORT_DISABLED', 'YouTube chat imports are paused by administrator.');
            }
            return;
        }
        // Check Master GameScope Visitor Gate
        const masterGateOpen = adaptiveAudienceController_1.adaptiveAudienceController.isMasterGateOpen();
        if (!masterGateOpen) {
            if (this.state.status !== 'GAME_SCOPE_GATE_CLOSED') {
                console.log('[YouTubeChatService] Master Gate closed: active GameScope visitors >= 10. Pausing chat ingestion.');
                this.updateStatus('GAME_SCOPE_GATE_CLOSED', 'Master Gate closed: 10 or more active GameScope website visitors present.');
            }
            return;
        }
        // Quota Exhaustion Guard (Requirement 4)
        if (this.state.isQuotaExhausted) {
            const todayUtc = new Date().toISOString().slice(0, 10);
            if (this.state.quotaDay !== todayUtc) {
                console.log(`[YouTubeChatService] New UTC day (${todayUtc}) arrived. Resuming from quota exhaustion.`);
                this.state.quotaDay = todayUtc;
                this.state.quotaUsedToday = 0;
                this.state.requestsToday = 0;
                this.state.isQuotaExhausted = false;
                this.state.quotaExhaustedAt = undefined;
                this.updateStatus('CONNECTED', null);
            }
            else {
                if (this.state.status !== 'QUOTA_EXHAUSTED') {
                    this.updateStatus('QUOTA_EXHAUSTED', 'YouTube API quota budget reached. Polling paused until midnight UTC.');
                }
                return; // Do NOT repeatedly retry requests when quota is exhausted
            }
        }
        // Check video selection
        const { videoId, source } = await this.resolveSelectedVideoId();
        if (!videoId || source === 'NONE') {
            if (this.state.status !== 'NOT_CONFIGURED') {
                this.updateStatus('NOT_CONFIGURED', 'No livestream video ID configured.');
            }
            return;
        }
        if (!this.isValidVideoId(videoId)) {
            this.updateStatus('API_ERROR', `Invalid video ID format: ${videoId}`);
            return;
        }
        const apiKey = (env_1.env.YOUTUBE_API_KEY || '').trim();
        if (!apiKey) {
            if (this.state.status !== 'API_ERROR') {
                this.updateStatus('API_ERROR', 'YOUTUBE_API_KEY is not configured on the backend server.');
            }
            return;
        }
        // Distributed Locking: Claim ingestion ownership
        const now = Date.now();
        const lockDoc = await db_1.db.getDoc('site_config', 'youtube_ingestion_state');
        if (lockDoc && lockDoc.claimedByInstance && lockDoc.claimedByInstance !== this.instanceId) {
            if (lockDoc.claimExpiresAt && lockDoc.claimExpiresAt > now) {
                return; // Another instance is actively ingesting
            }
        }
        // Renew claim
        this.state.claimedByInstance = this.instanceId;
        this.state.claimExpiresAt = now + 90000; // 90s claim lease
        // If chat ID not yet discovered or stream changed, discover activeLiveChatId
        // Requirement 2: Do NOT restart livestream discovery on every polling cycle!
        if (!this.state.liveChatId || this.state.selectedVideoId !== videoId) {
            await this.discoverLiveChat(videoId, apiKey);
            return;
        }
        // Ingest messages from active live chat
        return await this.fetchMessages(apiKey);
    }
    /**
     * Discover active live chat ID for video (Costs 1 quota unit)
     */
    async discoverLiveChat(videoId, apiKey) {
        if (this.state.isQuotaExhausted)
            return false;
        this.updateStatus('DISCOVERING_CHAT', 'Discovering livestream metadata and active live chat ID...');
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
        try {
            this.recordQuotaUsage(1); // videos.list = 1 unit
            const res = await fetch(url);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const errorMsg = data?.error?.message || `YouTube API HTTP ${res.status}`;
                if (res.status === 403 && (data?.error?.errors?.[0]?.reason === 'quotaExceeded' || errorMsg.includes('quota'))) {
                    this.state.isQuotaExhausted = true;
                    this.state.quotaExhaustedAt = Date.now();
                    this.updateStatus('QUOTA_EXHAUSTED', `YouTube Data API daily quota exceeded: ${errorMsg}`);
                }
                else {
                    this.updateStatus('API_ERROR', errorMsg);
                }
                return false;
            }
            if (!data.items || data.items.length === 0) {
                this.updateStatus('API_ERROR', `Video '${videoId}' not found on YouTube.`);
                return false;
            }
            const item = data.items[0];
            this.state.streamTitle = item.snippet?.title || '';
            this.state.channelTitle = item.snippet?.channelTitle || '';
            const liveDetails = item.liveStreamingDetails;
            if (!liveDetails) {
                this.updateStatus('API_ERROR', `Video '${videoId}' is a standard video and does not contain livestream details.`);
                return false;
            }
            const activeChatId = liveDetails.activeLiveChatId;
            if (!activeChatId) {
                if (liveDetails.actualEndTime) {
                    this.updateStatus('STREAM_ENDED', 'The livestream broadcast has concluded.');
                }
                else {
                    this.updateStatus('WAITING_FOR_LIVESTREAM', 'Livestream is scheduled or offline; waiting for active chat window.');
                }
                this.state.liveChatId = null;
                return false;
            }
            // Chat ID discovered!
            this.state.liveChatId = activeChatId;
            this.state.lastSuccessfulConnection = Date.now();
            this.state.reconnectAttempts = 0;
            this.updateStatus('CONNECTED', null);
            console.log(`[YouTubeChatService] Discovered activeLiveChatId for ${videoId}: [${activeChatId.substring(0, 10)}...]`);
            return true;
        }
        catch (err) {
            this.updateStatus('RECONNECTING', `Network error discovering chat: ${err.message}`);
            return false;
        }
    }
    /**
     * Fetch incoming messages via YouTube Data API v3 liveChatMessages.list (Costs 5 quota units)
     * Handles pagination, continuation token persistence, and chronological catch-up (Requirements 1, 2, 3)
     */
    async fetchMessages(apiKey) {
        if (!this.state.liveChatId || this.state.isQuotaExhausted) {
            return { importedCount: 0, hasMoreBacklog: false };
        }
        let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(this.state.liveChatId)}&part=snippet,authorDetails&key=${encodeURIComponent(apiKey)}`;
        if (this.nextPageToken) {
            url += `&pageToken=${encodeURIComponent(this.nextPageToken)}`;
        }
        try {
            this.recordQuotaUsage(5); // liveChatMessages.list = 5 units
            const res = await fetch(url);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const errorMsg = data?.error?.message || `YouTube API HTTP ${res.status}`;
                if (res.status === 403 && (data?.error?.errors?.[0]?.reason === 'quotaExceeded' || errorMsg.includes('quota'))) {
                    this.state.isQuotaExhausted = true;
                    this.state.quotaExhaustedAt = Date.now();
                    this.updateStatus('QUOTA_EXHAUSTED', `YouTube Data API daily quota exceeded: ${errorMsg}`);
                }
                else if (res.status === 404 || errorMsg.includes('liveChatEnded') || errorMsg.includes('liveChatNotFound')) {
                    this.updateStatus('STREAM_ENDED', 'Live chat has ended or is no longer available.');
                    this.state.liveChatId = null;
                }
                else {
                    this.state.reconnectAttempts += 1;
                    this.updateStatus('RECONNECTING', errorMsg);
                }
                return { importedCount: 0, hasMoreBacklog: false };
            }
            // Update dynamic polling interval suggested by YouTube (Requirement 1)
            if (typeof data.pollingIntervalMillis === 'number' && data.pollingIntervalMillis > 0) {
                this.youtubePollingIntervalMs = data.pollingIntervalMillis;
            }
            // Safe Continuation Token Persistence (Requirement 2 & 3)
            this.nextPageToken = data.nextPageToken || this.nextPageToken;
            this.state.nextPageToken = this.nextPageToken;
            this.state.lastSuccessfulConnection = Date.now();
            this.state.lastSuccessfulFetch = Date.now();
            this.state.lastIngestionTimestamp = Date.now();
            this.state.reconnectAttempts = 0;
            if (this.state.status !== 'CONNECTED') {
                this.updateStatus('CONNECTED', null);
            }
            // Check top-level activePollItem if present in API payload (Requirement 5)
            if (data.activePollItem || data.activePoll) {
                this.parseAndApplyPollItem(data.activePollItem || data.activePoll);
            }
            // Sort messages chronologically by publishedAt (Requirement 2 & 3)
            const rawItems = Array.isArray(data.items) ? data.items : [];
            const items = rawItems.slice().sort((a, b) => {
                const timeA = a.snippet?.publishedAt ? Date.parse(a.snippet.publishedAt) : 0;
                const timeB = b.snippet?.publishedAt ? Date.parse(b.snippet.publishedAt) : 0;
                return timeA - timeB;
            });
            let importedCount = 0;
            for (const item of items) {
                const success = await this.processMessageItem(item);
                if (success)
                    importedCount++;
            }
            // Catch-up backlog indicator: if page returned full 50 items and has next token, more messages are waiting
            const hasMoreBacklog = items.length >= 50 && Boolean(data.nextPageToken);
            // Broadcast updated metrics and persist state
            const metrics = adaptiveAudienceController_1.adaptiveAudienceController.getMetrics();
            socketManager_1.socketManager.broadcast('youtube:metrics_update', metrics);
            this.refreshTelemetryIntervals();
            db_1.db.setDoc('site_config', 'youtube_ingestion_state', this.state).catch(() => { });
            return { importedCount, hasMoreBacklog };
        }
        catch (err) {
            this.state.reconnectAttempts += 1;
            this.updateStatus('RECONNECTING', `Network error during message fetch: ${err.message}`);
            return { importedCount: 0, hasMoreBacklog: false };
        }
    }
    /**
     * Process a single incoming YouTube live chat message or poll event
     * Preserves chronological timestamp and avoids dropping delayed messages (Requirement 2 & 3)
     */
    async processMessageItem(item) {
        if (!item?.snippet || !item?.id)
            return false;
        // 1. Check if this is a poll event (Requirement 5)
        if (item.snippet?.type === 'pollEvent' || item.snippet?.pollDetails || item.pollDetails) {
            this.parseAndApplyPollItem(item);
            return false;
        }
        if (item.snippet.type !== 'textMessageEvent') {
            return false; // Skip non-text events
        }
        const messageText = item.snippet.textMessageDetails?.messageText || item.snippet.displayMessage || '';
        if (!messageText.trim())
            return false;
        // 2. Prevent duplicate imports (Deduplication via YouTube Message ID)
        const ytMessageId = item.id;
        if (this.processedMessageIds.has(ytMessageId)) {
            return false;
        }
        this.processedMessageIds.add(ytMessageId);
        // 3. Author identification
        const channelId = item.authorDetails?.channelId || item.authorDetails?.displayName || `yt_author_${item.id.substring(0, 8)}`;
        const originalAuthorName = item.authorDetails?.displayName || 'YouTubeViewer';
        // 4. Master Import Gate enforcement: Active GameScope visitors >= 10 halts all broadcast
        if (!adaptiveAudienceController_1.adaptiveAudienceController.isMasterGateOpen()) {
            return false;
        }
        // 5. Dynamic Adaptive Participant Admission & Temporary Identity Management
        const admission = adaptiveAudienceController_1.adaptiveAudienceController.admitOrProcessParticipant(channelId, originalAuthorName, this.state.selectedVideoId);
        if (!admission.admitted || !admission.identity) {
            return false; // Slot full or gate closed
        }
        const identity = admission.identity;
        // 6. Normalize into GameScope ChatMessage using original YouTube publishedAt timestamp (Requirement 3)
        const privateUserIdHash = crypto_1.default.createHash('sha256').update(channelId).digest('hex').substring(0, 16);
        const publishedAt = item.snippet.publishedAt ? Date.parse(item.snippet.publishedAt) : Date.now();
        const formattedTime = new Date(publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const normalizedMessage = {
            id: `msg_yt_${ytMessageId}`,
            userId: `yt_${privateUserIdHash}`,
            username: identity.displayName,
            avatarSvg: identity.avatarSvg,
            avatarColor: identity.avatarColor,
            text: messageText.trim().substring(0, 300),
            timestamp: formattedTime,
            timestampMs: publishedAt,
            likes: 0,
            source: 'youtube',
            youtubeMessageId: ytMessageId,
            badge: 'YOUTUBE'
        };
        // 7. Record in adaptive activity signals
        adaptiveAudienceController_1.adaptiveAudienceController.recordIncomingMessage(channelId);
        // 8. Persist message and enqueue for rate-limited broadcast (Requirement 3: won't overwhelm Firestore / Socket.IO)
        await db_1.db.setDoc('chat_messages', normalizedMessage.id, normalizedMessage);
        await queueService_1.queueService.enqueueChatMessage(normalizedMessage);
        this.state.importedMessageCount += 1;
        this.state.uniqueParticipantCount = adaptiveAudienceController_1.adaptiveAudienceController.getAdmittedCount();
        this.state.lastMessageTimestamp = Date.now();
        this.state.lastImportedMessage = {
            author: identity.displayName,
            text: messageText.trim().substring(0, 120),
            timestamp: formattedTime
        };
        return true;
    }
    /**
     * Helper: extract clean text from YouTube string or { runs: [{ text }] } object
     */
    extractYouTubeText(val) {
        if (!val)
            return '';
        if (typeof val === 'string')
            return val.trim();
        if (Array.isArray(val))
            return val.map(v => this.extractYouTubeText(v)).join(' ').trim();
        if (typeof val === 'object') {
            if (Array.isArray(val.runs)) {
                return val.runs.map((r) => r?.text || '').join('').trim();
            }
            if (typeof val.text === 'string')
                return val.text.trim();
            if (typeof val.simpleText === 'string')
                return val.simpleText.trim();
        }
        return String(val).trim();
    }
    /**
     * Parse and apply YouTube Live Poll item from liveChat API response (Requirement 5)
     */
    parseAndApplyPollItem(rawItem) {
        try {
            const details = rawItem.snippet?.pollDetails || rawItem.pollDetails || rawItem;
            const metadata = details.metadata || details;
            const questionText = this.extractYouTubeText(metadata.questionText || metadata.question);
            if (!questionText)
                return null;
            const rawOptions = metadata.options || [];
            const options = rawOptions.map((opt, idx) => {
                const text = this.extractYouTubeText(opt.optionText || opt.text || opt.label) || `Option ${idx + 1}`;
                const rawTally = opt.tally !== undefined ? opt.tally : (opt.voteCount !== undefined ? opt.voteCount : opt.votes);
                const votes = typeof rawTally === 'number'
                    ? rawTally
                    : parseInt(String(rawTally || '0').replace(/[^0-9]/g, ''), 10) || 0;
                return {
                    id: opt.id || `yt_opt_${idx + 1}`,
                    text,
                    votes
                };
            });
            const totalVotes = options.reduce((sum, opt) => sum + opt.votes, 0);
            const rawStatus = (this.extractYouTubeText(metadata.status || details.status) || 'active').toLowerCase();
            const status = rawStatus.includes('closed') || rawStatus.includes('ended') ? 'closed' : 'active';
            const poll = {
                id: rawItem.id || details.id || `yt_poll_${Date.now()}`,
                question: questionText,
                options,
                totalVotes,
                status,
                updatedAt: Date.now(),
                source: 'youtube'
            };
            this.currentPoll = poll;
            this.state.activePoll = poll;
            // Broadcast poll update to connected clients via Socket.IO
            socketManager_1.socketManager.broadcast('youtube:poll_updated', { poll });
            console.log(`[YouTubeChatService] YouTube poll update: "${poll.question}" (Status: ${poll.status}, Options: ${poll.options.length}, Total votes: ${poll.totalVotes})`);
            return poll;
        }
        catch (err) {
            console.warn('[YouTubeChatService] Failed to parse YouTube poll:', err.message);
            return null;
        }
    }
    getActivePoll() {
        return this.currentPoll;
    }
    setYouTubePoll(poll) {
        this.currentPoll = poll;
        this.state.activePoll = poll;
        socketManager_1.socketManager.broadcast('youtube:poll_updated', { poll });
    }
    /**
     * Admin: Change configured Video ID
     */
    async setVideoId(newVideoId, adminEmail) {
        const cleanId = newVideoId.trim();
        if (cleanId) {
            if (!this.isValidVideoId(cleanId)) {
                throw new Error(`Invalid YouTube Video ID format '${cleanId}'. Must be 11 characters.`);
            }
        }
        const previousId = this.state.selectedVideoId;
        // 1. Update config
        await adaptiveAudienceController_1.adaptiveAudienceController.updateConfig({ videoId: cleanId }, adminEmail);
        // 2. Start fresh stream admission session and clear temporary stream identity mappings
        adaptiveAudienceController_1.adaptiveAudienceController.startNewStreamSession(cleanId);
        this.currentPoll = null;
        this.state.activePoll = null;
        socketManager_1.socketManager.broadcast('youtube:poll_updated', { poll: null });
        this.state.streamSessionId = adaptiveAudienceController_1.adaptiveAudienceController.getStreamSessionId();
        this.state.liveChatId = null;
        this.nextPageToken = null;
        this.state.nextPageToken = null;
        this.state.reconnectAttempts = 0;
        // 3. Resolve and discover
        await this.resolveSelectedVideoId();
        await auditService_1.auditService.logAction({
            adminId: 'admin',
            adminEmail,
            action: 'UPDATE_YOUTUBE_CHAT_VIDEO_ID',
            previousValue: previousId,
            newValue: cleanId
        });
        console.log(`[YouTubeChatService] Video ID updated by ${adminEmail} to: '${cleanId || '(Default)'}'`);
        // Trigger immediate step
        this.step().catch(() => { });
        return this.getState();
    }
    /**
     * Admin: Set or Clear Custom YouTube Poll Stream
     * Allows extracting and displaying live polls from another YouTube chat using its stream ID or URL.
     */
    async setCustomPollVideoId(videoIdOrUrl, adminEmail) {
        const previous = this.customPollVideoId;
        if (!videoIdOrUrl || !videoIdOrUrl.trim()) {
            // Clear custom poll stream setting
            this.customPollVideoId = null;
            this.customPollLiveChatId = null;
            this.customPollStatus = 'IDLE';
            this.customPollLastError = null;
            this.customPollLastSyncedAt = null;
            this.customPollPageToken = null;
            this.state.customPollVideoId = null;
            this.state.customPollLiveChatId = null;
            this.state.customPollStatus = 'IDLE';
            await db_1.db.setDoc('site_config', 'youtube_custom_poll', {
                customPollVideoId: null,
                updatedAt: Date.now(),
                updatedBy: adminEmail
            });
            await auditService_1.auditService.logAction({
                adminId: 'admin',
                adminEmail,
                action: 'CLEAR_YOUTUBE_CUSTOM_POLL_STREAM',
                previousValue: previous
            });
            console.log(`[YouTubeChatService] Custom poll stream cleared by ${adminEmail}. Returning to default stream.`);
            return this.getState();
        }
        const cleanId = extractYouTubeVideoId(videoIdOrUrl);
        if (!cleanId || !this.isValidVideoId(cleanId)) {
            throw new Error(`Invalid YouTube Video ID or URL '${videoIdOrUrl}'. Must be an 11-character video ID or valid YouTube URL.`);
        }
        this.customPollVideoId = cleanId;
        this.customPollLiveChatId = null;
        this.customPollStatus = 'FETCHING';
        this.customPollLastError = null;
        this.customPollPageToken = null;
        this.state.customPollVideoId = cleanId;
        this.state.customPollStatus = 'FETCHING';
        await db_1.db.setDoc('site_config', 'youtube_custom_poll', {
            customPollVideoId: cleanId,
            updatedAt: Date.now(),
            updatedBy: adminEmail
        });
        await auditService_1.auditService.logAction({
            adminId: 'admin',
            adminEmail,
            action: 'SET_YOUTUBE_CUSTOM_POLL_STREAM',
            previousValue: previous,
            newValue: cleanId
        });
        console.log(`[YouTubeChatService] Custom poll stream configured to '${cleanId}' by ${adminEmail}. Triggering poll sync...`);
        // Sync poll immediately
        await this.syncCustomPollStream();
        return this.getState();
    }
    /**
     * Fetch and sync active poll from custom YouTube stream
     */
    async syncCustomPollStream() {
        if (!this.customPollVideoId) {
            return { success: false, poll: null, error: 'No custom poll stream ID configured.' };
        }
        const apiKey = (env_1.env.YOUTUBE_API_KEY || '').trim();
        if (!apiKey) {
            this.customPollStatus = 'ERROR';
            this.customPollLastError = 'YOUTUBE_API_KEY is not configured on the backend server.';
            return { success: false, poll: null, error: this.customPollLastError };
        }
        if (this.state.isQuotaExhausted) {
            this.customPollStatus = 'ERROR';
            this.customPollLastError = 'YouTube API quota exhausted.';
            return { success: false, poll: null, error: this.customPollLastError };
        }
        try {
            this.customPollStatus = 'FETCHING';
            // 1. Resolve liveChatId if not cached
            if (!this.customPollLiveChatId) {
                this.recordQuotaUsage(1);
                const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(this.customPollVideoId)}&key=${encodeURIComponent(apiKey)}`;
                const vidRes = await fetch(vidUrl);
                const vidData = await vidRes.json().catch(() => ({}));
                if (!vidRes.ok) {
                    const errMsg = vidData?.error?.message || `YouTube API HTTP ${vidRes.status}`;
                    this.customPollStatus = 'ERROR';
                    this.customPollLastError = errMsg;
                    return { success: false, poll: null, error: errMsg };
                }
                const item = vidData?.items?.[0];
                const activeChatId = item?.liveStreamingDetails?.activeLiveChatId;
                if (!activeChatId) {
                    this.customPollStatus = 'ERROR';
                    this.customPollLastError = `Stream '${this.customPollVideoId}' has no active live chat window.`;
                    return { success: false, poll: null, error: this.customPollLastError };
                }
                this.customPollLiveChatId = activeChatId;
            }
            if (!this.customPollLiveChatId) {
                this.customPollStatus = 'ERROR';
                this.customPollLastError = `Could not resolve live chat for stream '${this.customPollVideoId}'.`;
                return { success: false, poll: null, error: this.customPollLastError };
            }
            // 2. Query liveChatMessages to extract poll
            this.recordQuotaUsage(5);
            let pollMsgUrl = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(this.customPollLiveChatId)}&part=snippet&maxResults=50&key=${encodeURIComponent(apiKey)}`;
            if (this.customPollPageToken) {
                pollMsgUrl += `&pageToken=${encodeURIComponent(this.customPollPageToken)}`;
            }
            const msgRes = await fetch(pollMsgUrl);
            const msgData = await msgRes.json().catch(() => ({}));
            if (!msgRes.ok) {
                const errMsg = msgData?.error?.message || `YouTube API HTTP ${msgRes.status}`;
                this.customPollStatus = 'ERROR';
                this.customPollLastError = errMsg;
                return { success: false, poll: null, error: errMsg };
            }
            this.customPollPageToken = msgData.nextPageToken || this.customPollPageToken;
            this.customPollLastSyncedAt = Date.now();
            // Check activePollItem in response payload
            let foundPollItem = msgData.activePollItem || msgData.activePoll;
            if (!foundPollItem && Array.isArray(msgData.items)) {
                for (const item of msgData.items) {
                    if (item.snippet?.type === 'pollEvent' || item.snippet?.pollDetails || item.pollDetails) {
                        foundPollItem = item;
                        break;
                    }
                }
            }
            if (foundPollItem) {
                const parsed = this.parseAndApplyPollItem(foundPollItem);
                if (parsed) {
                    this.customPollStatus = 'ACTIVE';
                    this.customPollLastError = null;
                    return { success: true, poll: parsed };
                }
            }
            this.customPollStatus = 'NO_POLL';
            this.customPollLastError = 'No active poll currently found on the specified stream.';
            return { success: true, poll: this.currentPoll, error: this.customPollLastError };
        }
        catch (err) {
            this.customPollStatus = 'ERROR';
            this.customPollLastError = err.message;
            return { success: false, poll: null, error: err.message };
        }
    }
    /**
     * Admin: Force Reconnect
     */
    async forceReconnect(adminEmail) {
        console.log(`[YouTubeChatService] Force reconnect requested by ${adminEmail}`);
        this.state.liveChatId = null;
        this.nextPageToken = null;
        this.state.nextPageToken = null;
        this.state.reconnectAttempts = 0;
        this.updateStatus('DISCOVERING_CHAT', 'Forcing livestream re-discovery...');
        await auditService_1.auditService.logAction({
            adminId: 'admin',
            adminEmail,
            action: 'FORCE_RECONNECT_YOUTUBE_CHAT'
        });
        await this.step();
        return this.getState();
    }
}
exports.YouTubeChatService = YouTubeChatService;
exports.youtubeChatService = YouTubeChatService.getInstance();
