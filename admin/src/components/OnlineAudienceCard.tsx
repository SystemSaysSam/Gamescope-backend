import React, { useState, useEffect } from 'react';
import { Users, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { adminSocket } from '../services/adminSocket';

export const OnlineAudienceCard: React.FC = () => {
  const [breakdown, setBreakdown] = useState<{
    baseWebsiteVisitors: number;
    admittedLiveChatUsers: number;
    combinedAutoCount: number;
    forcedCount: number | null;
    isForced: boolean;
    effectiveCount: number;
    updatedAt?: number;
    updatedBy?: string;
  }>({
    baseWebsiteVisitors: 0,
    admittedLiveChatUsers: 0,
    combinedAutoCount: 0,
    forcedCount: null,
    isForced: false,
    effectiveCount: 0
  });

  const [inputCount, setInputCount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchBreakdown = async () => {
    try {
      const data = await adminApi.getOnlineCount();
      if (data) {
        setBreakdown(data);
        if (data.isForced && data.forcedCount !== null) {
          setInputCount(String(data.forcedCount));
        }
      }
    } catch (err: any) {
      console.warn('Could not fetch online count breakdown:', err.message);
    }
  };

  useEffect(() => {
    fetchBreakdown();

    const unsubVisitors = adminSocket.on('event:active_visitors', (payload: any) => {
      if (typeof payload?.activeVisitors === 'number') {
        setBreakdown(prev => ({
          ...prev,
          effectiveCount: payload.activeVisitors
        }));
      }
    });

    const unsubMetrics = adminSocket.on('youtube:metrics_update', () => {
      fetchBreakdown();
    });

    const interval = setInterval(fetchBreakdown, 10000);

    return () => {
      unsubVisitors();
      unsubMetrics();
      clearInterval(interval);
    };
  }, []);

  const handleForceUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(inputCount, 10);
    if (isNaN(count) || count < 0) {
      alert('Please enter a valid non-negative number for the online count.');
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await adminApi.setForcedOnlineCount(count);
      if (res?.breakdown) {
        setBreakdown(res.breakdown);
        setFeedback(`Count successfully forced to ${res.breakdown.effectiveCount.toLocaleString()}! Broadcasted live to all users.`);
      }
    } catch (err: any) {
      alert(`Error forcing online count: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToAuto = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await adminApi.setForcedOnlineCount(null);
      if (res?.breakdown) {
        setBreakdown(res.breakdown);
        setInputCount('');
        setFeedback(`Reset to automatic combined count (${res.breakdown.effectiveCount.toLocaleString()} active visitors).`);
      }
    } catch (err: any) {
      alert(`Error resetting online count: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-[#00f0ff]" />
            <h3 className="text-lg font-display font-black text-white uppercase tracking-wider">
              LIVE ONLINE AUDIENCE CONTROLLER
            </h3>
            {breakdown.isForced ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ff2a85]/20 text-[#ff2a85] border border-[#ff2a85]/40 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff2a85] animate-ping" />
                <span>FORCED OVERRIDE ACTIVE</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
                <span>AUTOMATIC COMBINED MODE</span>
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Combines real website visitors (sockets &amp; pings) with admitted YouTube chat participants. Force update overrides the public online count across all clients in real time.
          </p>
        </div>

        <button
          onClick={fetchBreakdown}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-300"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span>Sync</span>
        </button>
      </div>

      {/* 4 Audience Signal Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Signal 1: Website Sockets & Pings */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Website Visitors</span>
          <div className="text-2xl font-display font-bold text-[#00f0ff]">
            {breakdown.baseWebsiteVisitors.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-500 block">Web Sockets &amp; Pings</span>
        </div>

        {/* Signal 2: Admitted YouTube Chat Users */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Admitted YT Chat</span>
          <div className="text-2xl font-display font-bold text-[#ffaa00]">
            {breakdown.admittedLiveChatUsers.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-500 block">Live Chat Slots Occupied</span>
        </div>

        {/* Signal 3: Combined Auto Total */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Combined Auto Total</span>
          <div className="text-2xl font-display font-bold text-white">
            {breakdown.combinedAutoCount.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-[#00ff88] block">Web + Admitted Users</span>
        </div>

        {/* Signal 4: Effective Broadcasted Online Count */}
        <div className={`p-4 rounded-xl border space-y-1 ${breakdown.isForced ? 'bg-[#ff2a85]/10 border-[#ff2a85]/40' : 'bg-[#00ff88]/10 border-[#00ff88]/30'}`}>
          <span className="text-[10px] font-mono text-slate-300 block uppercase font-bold">Effective Online Count</span>
          <div className={`text-2xl font-display font-black ${breakdown.isForced ? 'text-[#ff2a85]' : 'text-[#00ff88]'}`}>
            {breakdown.effectiveCount.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-300 block">
            {breakdown.isForced ? `Forced Override` : `Live Public Metric`}
          </span>
        </div>
      </div>

      {/* Force Count Controller Form */}
      <form onSubmit={handleForceUpdate} className="p-4 rounded-xl bg-black/60 border border-white/10 space-y-3">
        <label className="block text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
          ADMIN ONLINE COUNT OVERRIDE
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <input
            type="number"
            min="0"
            max="1000000"
            value={inputCount}
            onChange={(e) => setInputCount(e.target.value)}
            placeholder="Enter custom count (e.g. 50, 250, 1500)..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-black border border-white/15 focus:border-[#00f0ff] text-white font-mono text-sm outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff2a85] to-[#ffaa00] hover:opacity-90 font-display font-bold text-xs text-white uppercase tracking-wider shadow-lg shadow-[#ff2a85]/20 flex items-center justify-center space-x-1.5"
          >
            <Zap className="w-4 h-4" />
            <span>Force Update Count</span>
          </button>
          {breakdown.isForced && (
            <button
              type="button"
              onClick={handleResetToAuto}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-mono font-bold text-slate-200 uppercase"
            >
              Reset to Auto
            </button>
          )}
        </div>
        {feedback && (
          <p className="text-xs font-mono text-[#00ff88] flex items-center space-x-1.5 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{feedback}</span>
          </p>
        )}
      </form>
    </div>
  );
};
