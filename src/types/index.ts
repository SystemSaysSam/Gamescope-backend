/**
 * GameScope Live — Comprehensive Server Type Definitions
 */

export type EventState = 'UPCOMING' | 'STARTING' | 'LIVE' | 'BREAK' | 'ENDED';

export interface PublicEventConfig {
  eventId: string;
  state: EventState;
  stateUpdatedAt: number;
  expectedDurationMinutes: number;
  youtubeVideoId: string;
  youtubeStreamUrl: string;
  countdown: {
    targetIso: string;
    targetTimestampMs: number;
    timezone: string;
    label: string;
  };
  inactiveScreen: {
    enabled: boolean;
    heading: string;
    description: string;
    secondaryMessage?: string;
  };
  version: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatarSvg: string;
  avatarColor: string;
  text: string;
  timestamp: string;
  timestampMs: number;
  likes: number;
  likedByCurrentUser?: boolean;
  isShoutout?: boolean;
  shoutoutType?: 'arcade' | 'comment' | 'system';
  shoutoutTitle?: string;
  isAdmin?: boolean;
  badge?: string;
  source?: 'gamescope' | 'youtube';
  youtubeMessageId?: string;
}

export type ReactionType = 'heart' | 'fire' | 'laugh' | 'surprised' | 'skull' | 'clap' | 'bolt' | 'gamepad';

export interface PinnedComment {
  id: string;
  username: string;
  text: string;
  likes: number;
  avatarSvg: string;
  avatarColor: string;
  isAdminPinned: boolean;
  pinnedAt: number;
  rotationExpiresAt?: number;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface LivePoll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  status: 'active' | 'closed';
  createdAt: number;
  closedAt?: number;
  deadlineIso?: string;
}

export interface ArcadeSession {
  sessionId: string;
  playerId: string;
  playerName: string;
  startedAt: number;
  lastHeartbeat: number;
  completed: boolean;
  seed: number;
  rulesVersion: number;
}

export interface ArcadeScoreSubmission {
  sessionId: string;
  playerId: string;
  playerName: string;
  distance: number;
  endReason: string;
  checkpoints: number;
  stats: {
    longestJump: number;
    clean: number;
    near: number;
    coins: number;
    jetpacks: number;
    doubleJumps: number;
    nitroUsed: number;
    nitroDist: number;
    duration: number;
  };
  clientBuild: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  playerId: string;
  username: string;
  score: number;
  metric: string;
  avatarSvg?: string;
  badge?: string;
  submittedAt: number;
  isValid: boolean;
}

export interface PushSubscriptionRecord {
  id: string; // sha256 of endpoint
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  userAgent?: string;
  createdAt: number;
  updatedAt: number;
  lastDeliveredAt?: number;
  failedAttempts: number;
  active: boolean;
  lastError?: string;
  expiredAt?: number;
  unsubscribedAt?: number;
}

export type ReminderStatus = 
  | 'NOT_SCHEDULED'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'TRIGGER_EXECUTED'
  | 'PARTIALLY_DELIVERED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'MISSED';

export interface DeliveryBatchStats {
  totalEligible: number;
  attempts: number;
  acceptedByPushService: number;
  failed: number;
  expiredSubscriptions: number;
  errors?: string[];
}

export interface ReminderScheduleRecord {
  id: string; // 'current_event_reminder'
  eventId: string;
  configVersion: number;
  eventStartTimeMs: number;
  eventStartTimeIso: string;
  timezone: string;
  scheduledReminderTimeMs: number; // eventStartTimeMs - 15 * 60 * 1000
  scheduledReminderTimeIso: string;
  status: ReminderStatus;
  triggerExecuted: boolean;
  triggerExecutedAt?: number;
  claimedByInstance?: string;
  claimExpiresAt?: number;
  deliveryStats?: DeliveryBatchStats;
  lastError?: string;
  recoveryAction?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationBroadcast {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'important' | 'warning';
  url?: string;
  sendInSite: boolean;
  sendWebPush: boolean;
  sentAt: number;
  sentBy: string;
  deliveryStats: {
    inSiteRecipients: number;
    pushAttempted: number;
    pushSuccessful: number; // accepted by push services
    pushFailed: number;
    expiredSubscriptions?: number;
    totalEligible?: number;
  };
}

export interface EmailSubscriber {
  id: string;
  name: string;
  email: string;
  subscribedAt: number;
  active: boolean;
  source: string;
  unsubscribeToken: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  resourceId?: string;
  previousValue?: any;
  newValue?: any;
  timestamp: number;
  ip?: string;
}

export interface AnalyticsData {
  activeVisitors: number;
  chatParticipants: number;
  arcadePlayers: number;
  totalSubscribers: number;
  totalPushSubscribers: number;
  youtubeLiveViewers: number | null;
  youtubeViewerNote: string;
  totalMessagesSent: number;
  totalArcadeGamesPlayed: number;
  serverUptimeSeconds: number;
}

/* ---------------- YouTube Live Chat & GTA Identity Models ---------------- */

export type IdentitySourceType = 'GAMESCOPE' | 'YOUTUBE';

export interface UserIdentity {
  id: string; // e.g. ident_gs_<userId> or ident_yt_<channelId>
  sourceType: IdentitySourceType;
  sourceId: string; // userId or channelId
  displayName: string; // Clean for GameScope; with numeric suffix for YouTube
  normalizedName: string; // Lowercase for atomic uniqueness
  avatarSvg: string;
  avatarColor: string;
  assignedAt: number;
  isActive: boolean;
}

export type YouTubeIngestionStatus = 
  | 'NOT_CONFIGURED'
  | 'WAITING_FOR_LIVESTREAM'
  | 'DISCOVERING_CHAT'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'POLLING'
  | 'WAITING'
  | 'IMPORT_DISABLED'
  | 'GAME_SCOPE_GATE_CLOSED'
  | 'RECONNECTING'
  | 'STREAM_ENDED'
  | 'API_ERROR'
  | 'QUOTA_ERROR'
  | 'QUOTA_EXHAUSTED';

export type ActivityLevel = 'QUIET' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export interface YouTubeChatConfig {
  videoId?: string;
  importEnabled: boolean;
  pollFallbackEnabled: boolean; // Enable YouTube Poll Fallback when no GameScope admin poll is active
  adaptiveEnabled: boolean;
  minimumCapacity: number;
  maximumCapacity: number;
  defaultCapacity: number;
  manualCapacityOverride?: number | null;
  inactivityTimeoutMs?: number; // Configurable inactivity threshold (default 120000ms / 2 min)
  pollingIntervalSeconds?: number; // Configurable polling delay (default 60s, 30-90s continuous)
  quotaDailyBudget?: number; // Configurable daily quota budget (default 10,000 units)
  updatedAt: number;
  updatedBy: string;
}

export interface YouTubePollOption {
  id: string;
  text: string;
  votes: number;
}

export interface YouTubeLivePoll {
  id: string;
  question: string;
  options: YouTubePollOption[];
  totalVotes: number;
  status: 'active' | 'closed';
  updatedAt: number;
  source: 'youtube';
}

export interface ChatWipeState {
  clearedAt: number;
  clearedBy: string;
  generation: number;
}

export interface LastImportedMessageSnippet {
  author: string;
  text: string;
  timestamp: string;
}

export interface YouTubeIngestionState {
  selectedVideoId: string;
  videoIdSource: 'ADMIN' | 'ENVIRONMENT' | 'NONE';
  streamSessionId?: string;
  liveChatId: string | null;
  status: YouTubeIngestionStatus;
  channelTitle?: string;
  streamTitle?: string;
  activePoll?: YouTubeLivePoll | null;
  lastMessageTimestamp?: number;
  lastSuccessfulConnection?: number;
  lastIngestionTimestamp?: number;
  lastConnectionAttempt?: number;
  lastError?: string | null;
  reconnectAttempts: number;
  importedMessageCount: number;
  uniqueParticipantCount: number;
  claimedByInstance?: string;
  claimExpiresAt?: number;
  // Delayed Continuous Polling & Quota Budget Telemetry
  nextPageToken?: string | null;
  configuredPollingIntervalSeconds?: number;
  effectivePollingIntervalSeconds?: number;
  quotaDay?: string;
  quotaUsedToday?: number;
  quotaDailyBudget?: number;
  requestsToday?: number;
  estimatedDailyCost?: number;
  isQuotaExhausted?: boolean;
  quotaExhaustedAt?: number;
  lastSuccessfulFetch?: number;
  lastImportedMessage?: LastImportedMessageSnippet | null;
}

export interface AdaptiveChatMetrics {
  activityLevel: ActivityLevel;
  currentCapacity: number;
  admittedParticipantCount: number;
  activeParticipantCount: number;
  releasedParticipantCount: number;
  inactivityTimeoutMs: number;
  messagesPerMinute: number;
  uniqueChattersInWindow: number;
  messageVelocityPerSec: number;
  queueDepth: number;
  processingLatencyMs: number;
  trend: 'SCALING_UP' | 'SCALING_DOWN' | 'STABLE';
  masterGateOpen: boolean;
  activeGameScopeVisitors: number;
  updatedAt: number;
}

export type ParticipantAdmissionStatus = 'ACTIVE' | 'RELEASED';

export interface YouTubeAdmittedParticipant {
  id: string; // session docId e.g. yt_sess_<streamId>_<channelId>
  channelId: string;
  originalUsername: string; // temporary original YouTube username (metadata)
  streamSessionId: string;
  streamId: string;
  assignedIdentity: UserIdentity;
  displayName: string; // e.g. "CrazyTommy07"
  firstAdmittedAt: number;
  lastActivityAt: number;
  messageCount: number;
  status: ParticipantAdmissionStatus;
}

export type YouTubeParticipantSession = YouTubeAdmittedParticipant;
