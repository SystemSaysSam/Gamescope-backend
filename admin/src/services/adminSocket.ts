import { io, Socket } from 'socket.io-client';
import { adminApi } from './adminApi';

class AdminSocketService {
  private static instance: AdminSocketService;
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  public static getInstance(): AdminSocketService {
    if (!AdminSocketService.instance) {
      AdminSocketService.instance = new AdminSocketService();
    }
    return AdminSocketService.instance;
  }

  public connect() {
    if (this.socket && this.socket.connected) return;

    const token = adminApi.getToken();
    this.socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('[AdminSocket] Connected with ID:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('[AdminSocket] Disconnected.');
    });

    // Forward events to registered listeners
    const knownEvents = [
      'event:init_state',
      'event:state_updated',
      'event:countdown_updated',
      'event:stream_updated',
      'event:inactive_updated',
      'event:force_sync',
      'chat:message',
      'chat:message_deleted',
      'chat:message_pinned',
      'poll:created',
      'poll:results',
      'poll:closed',
      'poll:removed',
      'arcade:leaderboard_updated',
      'notification:broadcast',
      'reminder:status_update',
      'youtube:status_update',
      'youtube:metrics_update'
    ];

    for (const evt of knownEvents) {
      this.socket.on(evt, (data) => {
        const cbs = this.listeners.get(evt);
        if (cbs) {
          cbs.forEach(cb => cb(data));
        }
      });
    }
  }

  public on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const adminSocket = AdminSocketService.getInstance();
