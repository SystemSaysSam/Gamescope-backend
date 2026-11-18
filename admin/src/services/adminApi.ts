const API_BASE = '/api';

export class AdminApiService {
  private static instance: AdminApiService;
  private token: string | null = null;

  private constructor() {
    this.token = localStorage.getItem('gamescope_admin_jwt');
  }

  public static getInstance(): AdminApiService {
    if (!AdminApiService.instance) {
      AdminApiService.instance = new AdminApiService();
    }
    return AdminApiService.instance;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('gamescope_admin_jwt', token);
    } else {
      localStorage.removeItem('gamescope_admin_jwt');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      this.setToken(null);
      window.dispatchEvent(new Event('gamescope-admin-unauthorized'));
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    return data as T;
  }

  /* ---------------- Auth ---------------- */

  public async login(params: { firebaseToken?: string; adminSecret?: string; email?: string }) {
    const data = await this.request<any>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  public async getMe() {
    return this.request<{ admin: { adminId: string; email: string; role: string } }>('/admin/auth/me');
  }

  public logout() {
    this.setToken(null);
  }

  /* ---------------- Event & Stream ---------------- */

  public async getPublicConfig() {
    return this.request<any>('/config/public');
  }

  public async updateEventState(state: string) {
    return this.request<any>('/admin/event/state', {
      method: 'POST',
      body: JSON.stringify({ state })
    });
  }

  public async updateCountdown(params: { targetIso: string; timezone?: string; label?: string }) {
    return this.request<any>('/admin/event/countdown', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  public async updateStream(params: { streamUrlOrId: string; expectedDurationMinutes?: number }) {
    return this.request<any>('/admin/event/stream', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  public async updateInactiveScreen(params: { enabled: boolean; heading: string; description: string; secondaryMessage?: string }) {
    return this.request<any>('/admin/event/inactive-screen', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  public async forceSync() {
    return this.request<any>('/admin/event/force-sync', { method: 'POST' });
  }

  /* ---------------- Chat & Moderation ---------------- */

  public async getMessages(limit: number = 60) {
    return this.request<{ messages: any[] }>(`/chat/messages?limit=${limit}`);
  }

  public async pinMessage(messageId: string) {
    return this.request<any>(`/admin/chat/messages/${messageId}/pin`, { method: 'POST' });
  }

  public async customPin(params: { username: string; text: string; avatarColor?: string }) {
    return this.request<any>('/admin/chat/custom-pin', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  public async unpinMessage() {
    return this.request<any>('/admin/chat/pin', { method: 'DELETE' });
  }

  public async deleteMessage(messageId: string) {
    return this.request<any>(`/admin/chat/messages/${messageId}`, { method: 'DELETE' });
  }

  public async timeoutUser(userId: string, durationSeconds: number, reason?: string) {
    return this.request<any>(`/admin/chat/users/${userId}/timeout`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds, reason })
    });
  }

  public async removeTimeout(userId: string) {
    return this.request<any>(`/admin/chat/users/${userId}/timeout`, { method: 'DELETE' });
  }

  public async banUser(userId: string, reason?: string) {
    return this.request<any>(`/admin/chat/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public async unbanUser(userId: string) {
    return this.request<any>(`/admin/chat/users/${userId}/ban`, { method: 'DELETE' });
  }

  public async getRestrictions() {
    return this.request<{ restrictions: any[] }>('/admin/chat/restrictions');
  }

  /* ---------------- Polls ---------------- */

  public async createPoll(params: { question: string; options: string[]; durationMinutes?: number }) {
    return this.request<any>('/admin/polls', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  public async closePoll(pollId: string) {
    return this.request<any>(`/admin/polls/${pollId}/close`, { method: 'POST' });
  }

  public async removePoll(pollId?: string, deleteFromHistory: boolean = false) {
    const endpoint = pollId ? `/admin/polls/${pollId}?deleteFromHistory=${deleteFromHistory}` : `/admin/polls/active?deleteFromHistory=${deleteFromHistory}`;
    return this.request<any>(endpoint, { method: 'DELETE' });
  }

  public async getPollHistory() {
    return this.request<{ polls: any[] }>('/admin/polls');
  }

  /* ---------------- Arcade ---------------- */

  public async getArcadeSessions() {
    return this.request<{ sessions: any[] }>('/admin/arcade/sessions');
  }

  public async getArcadeLeaderboard() {
    return this.request<{ leaderboard: any[] }>('/admin/arcade/leaderboard');
  }

  public async invalidateScore(scoreId: string) {
    return this.request<any>(`/admin/arcade/scores/${scoreId}`, { method: 'DELETE' });
  }

  public async resetLeaderboard() {
    return this.request<any>('/admin/arcade/reset-leaderboard', { method: 'POST' });
  }

  /* ---------------- Notifications ---------------- */

  public async getNotificationStats() {
    return this.request<any>('/admin/notifications/stats');
  }

  public async getReminderDetails() {
    return this.request<{
      schedule: any;
      history: any[];
      eventConfig: any;
    }>('/admin/notifications/reminder');
  }

  public async syncReminder() {
    return this.request<{ success: boolean; schedule: any }>('/admin/notifications/reminder/sync', {
      method: 'POST'
    });
  }

  public async triggerReminderNow() {
    return this.request<{ success: boolean; schedule: any }>('/admin/notifications/reminder/trigger-now', {
      method: 'POST'
    });
  }

  public async sendBroadcast(params: {
    title: string;
    body: string;
    type: string;
    url?: string;
    sendInSite: boolean;
    sendWebPush: boolean;
  }) {
    return this.request<any>('/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  public async sendTestNotification() {
    return this.request<any>('/admin/notifications/test', { method: 'POST' });
  }

  public async getBroadcastHistory() {
    return this.request<{ history: any[] }>('/admin/notifications/history');
  }

  /* ---------------- Email Subscribers ---------------- */

  public async getEmailSubscribers(search?: string) {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request<{ subscribers: any[] }>(`/admin/subscriptions/email${q}`);
  }

  public async removeEmailSubscriber(id: string) {
    return this.request<any>(`/admin/subscriptions/email/${id}`, { method: 'DELETE' });
  }

  /* ---------------- Analytics & Audit ---------------- */

  public async getAnalytics() {
    return this.request<any>('/admin/analytics');
  }

  public async getAuditLogs() {
    return this.request<{ logs: any[] }>('/admin/audit-logs');
  }

  public async clearChatHistory() {
    return this.request<{ success: boolean; wipeState: any }>('/admin/chat/clear', { method: 'POST' });
  }

  /* ---------------- YouTube Live Chat Integration ---------------- */

  public async getYouTubeStatus() {
    return this.request<{ config: any; state: any; metrics: any; participants?: any[]; effectivePoll?: any }>('/admin/youtube');
  }

  public async updateYouTubeVideoId(videoId: string) {
    return this.request<any>('/admin/youtube/video-id', {
      method: 'POST',
      body: JSON.stringify({ videoId })
    });
  }

  public async updateYouTubeSettings(settings: {
    importEnabled?: boolean;
    pollFallbackEnabled?: boolean;
    adaptiveEnabled?: boolean;
    minimumCapacity?: number;
    maximumCapacity?: number;
    defaultCapacity?: number;
    manualCapacityOverride?: number | null;
    inactivityTimeoutMs?: number;
    pollingIntervalSeconds?: number;
    quotaDailyBudget?: number;
  }) {
    return this.request<any>('/admin/youtube/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  public async reconnectYouTube() {
    return this.request<any>('/admin/youtube/reconnect', { method: 'POST' });
  }

  public async resetYouTubeQuota() {
    return this.request<any>('/admin/youtube/reset-quota', { method: 'POST' });
  }

  public async resetYouTubeSession() {
    return this.request<any>('/admin/youtube/reset-session', { method: 'POST' });
  }

  public async getYouTubeMetrics() {
    return this.request<{ metrics: any; state: any; participants?: any[] }>('/admin/youtube/metrics');
  }
}

export const adminApi = AdminApiService.getInstance();
