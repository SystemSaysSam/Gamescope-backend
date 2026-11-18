import React from 'react';
import { 
  Radio, 
  Users, 
  MessageSquare, 
  Gamepad2, 
  Bell, 
  Clock, 
  Youtube, 
  Server, 
  ShieldAlert, 
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { AdminTab } from '../AdminNavbar';

interface OverviewTabProps {
  config: any;
  analytics: any;
  recentLogs: any[];
  onNavigateTab: (tab: AdminTab) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  config,
  analytics,
  recentLogs,
  onNavigateTab,
  onRefresh,
  isRefreshing
}) => {
  const stateColors: Record<string, string> = {
    UPCOMING: 'text-[#00f0ff] border-[#00f0ff]/40 bg-[#00f0ff]/10',
    STARTING: 'text-[#ff2a85] border-[#ff2a85]/40 bg-[#ff2a85]/10',
    LIVE: 'text-[#00ff88] border-[#00ff88]/40 bg-[#00ff88]/10',
    BREAK: 'text-[#ffaa00] border-[#ffaa00]/40 bg-[#ffaa00]/10',
    ENDED: 'text-red-400 border-red-500/40 bg-red-500/10'
  };

  const currentState = config?.state || 'UPCOMING';
  const targetIso = config?.countdown?.targetIso;
  const targetFormatted = targetIso ? new Date(targetIso).toLocaleString() : 'Not Set';

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d111a] border border-white/10">
        <div>
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider flex items-center space-x-2">
            <span>OPERATIONAL STATUS OVERVIEW</span>
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-ping" />
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Realtime telemetry and event management. Config version: v{config?.version || 1}
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-200 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#00f0ff] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* 4 Hero Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Event State */}
        <div className="p-4 rounded-2xl bg-[#0d111a] border border-white/10 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">EVENT STATE</span>
            <Radio className="w-4 h-4 text-[#ff2a85] animate-pulse" />
          </div>
          <div className="mt-3">
            <span className={`inline-block px-3 py-1 rounded-xl text-lg font-display font-bold uppercase tracking-wider border ${stateColors[currentState] || stateColors.UPCOMING}`}>
              {currentState}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Duration: {config?.expectedDurationMinutes || 360}m</span>
            <button
              onClick={() => onNavigateTab('event')}
              className="text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Manage</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Live Visitors */}
        <div className="p-4 rounded-2xl bg-[#0d111a] border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">ACTIVE VISITORS</span>
            <Users className="w-4 h-4 text-[#00f0ff]" />
          </div>
          <div className="mt-2 text-2xl font-display font-bold text-white">
            {analytics?.activeVisitors?.toLocaleString() || 0}
            <span className="text-xs font-mono font-normal text-[#00ff88] ml-2">LIVE SOCKETS</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Chatters: {analytics?.chatParticipants || 0}</span>
            <button
              onClick={() => onNavigateTab('analytics')}
              className="text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Details</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: Countdown Target */}
        <div className="p-4 rounded-2xl bg-[#0d111a] border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">TARGET START TIME</span>
            <Clock className="w-4 h-4 text-[#ffaa00]" />
          </div>
          <div className="mt-2 text-base font-display font-bold text-white truncate" title={targetFormatted}>
            {config?.countdown?.label || '4:30 PM IST'}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>{config?.countdown?.timezone || 'Asia/Kolkata'}</span>
            <button
              onClick={() => onNavigateTab('event')}
              className="text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Edit</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 4: YouTube Stream */}
        <div className="p-4 rounded-2xl bg-[#0d111a] border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">YOUTUBE VIDEO ID</span>
            <Youtube className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 text-lg font-mono font-bold text-[#00f0ff] truncate">
            {config?.youtubeVideoId || 'QdBZY2fkU-0'}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Embed Ready</span>
            <button
              onClick={() => onNavigateTab('event')}
              className="text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Preview</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

      </div>

      {/* Secondary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Chat Activity Card */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-mono font-bold text-white flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-[#00f0ff]" />
              <span>CHAT & MODERATION</span>
            </span>
            <button
              onClick={() => onNavigateTab('chat')}
              className="text-xs font-mono text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Console</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">TOTAL MESSAGES</span>
              <span className="text-lg font-bold text-white">{analytics?.totalMessagesSent || 0}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">PARTICIPANTS</span>
              <span className="text-lg font-bold text-[#00ff88]">{analytics?.chatParticipants || 0}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Realtime independent chat engine with progressive cooldown and timeout enforcement.
          </p>
        </div>

        {/* Arcade Activity Card */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-mono font-bold text-white flex items-center space-x-2">
              <Gamepad2 className="w-4 h-4 text-[#ff2a85]" />
              <span>VICE CITY RUN ARCADE</span>
            </span>
            <button
              onClick={() => onNavigateTab('arcade')}
              className="text-xs font-mono text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Leaderboard</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">RUNS RECORDED</span>
              <span className="text-lg font-bold text-white">{analytics?.totalArcadeGamesPlayed || 0}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">UNIQUE RACERS</span>
              <span className="text-lg font-bold text-[#ffaa00]">{analytics?.arcadePlayers || 0}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Server-verified run physics and persistent competitive distance records.
          </p>
        </div>

        {/* Audience Subscriptions Card */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-mono font-bold text-white flex items-center space-x-2">
              <Bell className="w-4 h-4 text-[#ffaa00]" />
              <span>AUDIENCE OUTREACH</span>
            </span>
            <button
              onClick={() => onNavigateTab('notifications')}
              className="text-xs font-mono text-[#00f0ff] hover:underline flex items-center space-x-0.5"
            >
              <span>Broadcasts</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">PUSH DEVICES</span>
              <span className="text-lg font-bold text-[#00f0ff]">{analytics?.totalPushSubscribers || 0}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">EMAIL SUBSCRIBERS</span>
              <span className="text-lg font-bold text-white">{analytics?.totalSubscribers || 0}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Web Push reminders scheduled for 15m prior to stream start.
          </p>
        </div>

      </div>

      {/* System Health & Audit Log Snippet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* System Health */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <h3 className="text-sm font-mono font-bold text-white flex items-center space-x-2">
            <Server className="w-4 h-4 text-[#00ff88]" />
            <span>BACKEND & REALTIME INFRASTRUCTURE</span>
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400">Server Architecture</span>
              <span className="text-white">Node.js + TypeScript + Express</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400">Database Layer</span>
              <span className="text-[#00ff88]">Firebase Cloud Firestore</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400">Realtime Protocol</span>
              <span className="text-[#00f0ff]">Socket.IO (WebSocket + Polling Fallback)</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400">Server Uptime</span>
              <span className="text-white">{Math.floor((analytics?.serverUptimeSeconds || 0) / 60)} minutes</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400">YouTube Livestream Viewers</span>
              <span className="text-slate-400 italic">Distinguished from site visitors (unfabricated)</span>
            </div>
          </div>
        </div>

        {/* Recent Audit Activity */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-bold text-white flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-[#ff2a85]" />
              <span>RECENT ADMINISTRATIVE AUDIT ACTIONS</span>
            </h3>
            <button
              onClick={() => onNavigateTab('audit')}
              className="text-xs font-mono text-[#00f0ff] hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-2.5">
            {recentLogs && recentLogs.length > 0 ? (
              recentLogs.slice(0, 5).map(log => (
                <div key={log.id} className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs font-mono flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <span className="text-[#00f0ff] font-bold block truncate">{log.action}</span>
                    <span className="text-[10px] text-slate-400 truncate block">by {log.adminEmail}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs font-mono text-slate-500 italic py-4 text-center">
                No recent administrative actions recorded.
              </p>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
