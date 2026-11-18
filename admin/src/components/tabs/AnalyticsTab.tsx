import React from 'react';
import { 
  BarChart3, 
  Users, 
  MessageSquare, 
  Gamepad2, 
  Bell, 
  Youtube, 
  ShieldAlert, 
  Clock,
  Activity
} from 'lucide-react';

interface AnalyticsTabProps {
  analytics: any;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ analytics, onRefresh, isRefreshing }) => {
  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d111a] border border-white/10">
        <div>
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-[#00f0ff]" />
            <span>REALTIME AUDIENCE TELEMETRY & ANALYTICS</span>
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Strictly authentic operational measurements. Metrics distinguish web visitors, chat participants, arcade racers, and YouTube feed.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-200"
        >
          <Activity className={`w-3.5 h-3.5 text-[#00f0ff] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* 4 Distinct Core Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Live Sockets */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE WEB VISITORS</span>
            <Users className="w-4 h-4 text-[#00f0ff]" />
          </div>
          <div className="text-3xl font-display font-bold text-white">
            {analytics?.activeVisitors?.toLocaleString() || 0}
          </div>
          <p className="text-[10px] font-mono text-[#00ff88]">
            Realtime Socket.IO connection & ping counter
          </p>
        </div>

        {/* Metric 2: Unique Chatters */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>CHAT PARTICIPANTS</span>
            <MessageSquare className="w-4 h-4 text-[#ff2a85]" />
          </div>
          <div className="text-3xl font-display font-bold text-white">
            {analytics?.chatParticipants?.toLocaleString() || 0}
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Total Messages: {analytics?.totalMessagesSent?.toLocaleString() || 0}
          </p>
        </div>

        {/* Metric 3: Arcade Players */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ARCADE RACERS</span>
            <Gamepad2 className="w-4 h-4 text-[#ffaa00]" />
          </div>
          <div className="text-3xl font-display font-bold text-white">
            {analytics?.arcadePlayers?.toLocaleString() || 0}
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Runs Completed: {analytics?.totalArcadeGamesPlayed?.toLocaleString() || 0}
          </p>
        </div>

        {/* Metric 4: Outreach Audience */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>SUBSCRIBERS</span>
            <Bell className="w-4 h-4 text-[#00ff88]" />
          </div>
          <div className="text-3xl font-display font-bold text-white">
            {((analytics?.totalPushSubscribers || 0) + (analytics?.totalSubscribers || 0)).toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            {analytics?.totalPushSubscribers || 0} Push · {analytics?.totalSubscribers || 0} Email
          </p>
        </div>

      </div>

      {/* YouTube Livestream Metric Transparency Card */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2">
            <Youtube className="w-5 h-5 text-red-500" />
            <h3 className="font-display font-black text-lg text-white tracking-wider uppercase">
              YOUTUBE LIVESTREAM VIEWER TELEMETRY
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-slate-300">
            EXTERNAL INTEGRATION
          </span>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Live YouTube Viewers:</span>
            <span className="text-[#ffaa00] font-bold">
              {analytics?.youtubeLiveViewers !== null ? analytics.youtubeLiveViewers : 'UNAVAILABLE WITHOUT DATA API KEY'}
            </span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            {analytics?.youtubeViewerNote}
          </p>
          <p className="text-[10px] text-slate-500 italic pt-1 border-t border-white/5">
            Rule enforcement: Website visitor counts are never conflated with YouTube viewer metrics. No fabricated viewer numbers are ever generated.
          </p>
        </div>
      </div>

      {/* Infrastructure Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3 text-xs font-mono">
          <div className="flex items-center space-x-2 text-white font-bold pb-2 border-b border-white/5">
            <Clock className="w-4 h-4 text-[#00f0ff]" />
            <span>SERVER LIFECYCLE & RETENTION</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">Process Uptime:</span>
            <span className="text-white">{Math.floor((analytics?.serverUptimeSeconds || 0) / 60)} minutes</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">Realtime Engine:</span>
            <span className="text-[#00ff88]">Active (Socket.IO + Pub/Sub Worker Pipeline)</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-400">Abuse Protection:</span>
            <span className="text-white">Active (Rate Limit + Cooldowns + Bounded Queue)</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3 text-xs font-mono">
          <div className="flex items-center space-x-2 text-white font-bold pb-2 border-b border-white/5">
            <ShieldAlert className="w-4 h-4 text-[#ff2a85]" />
            <span>ANALYTICS WRITE MINIMIZATION</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Client pings and high-frequency heartbeats are aggregated in-memory with periodic batched flushes, preventing redundant writes to Firestore.
          </p>
        </div>
      </div>

    </div>
  );
};
