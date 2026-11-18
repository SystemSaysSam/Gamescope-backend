import React, { useState, useEffect } from 'react';
import { 
  Youtube, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  ShieldAlert, 
  Sliders, 
  Users, 
  Zap, 
  Radio, 
  Activity, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Trash2,
  Gauge,
  Clock
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { adminSocket } from '../../services/adminSocket';

export const YouTubeChatTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [_config, setConfig] = useState<any | null>(null);
  const [state, setState] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);

  // Form Controls
  const [videoIdInput, setVideoIdInput] = useState('');
  const [savingVideoId, setSavingVideoId] = useState(false);
  const [videoIdSuccess, setVideoIdSuccess] = useState(false);
  const [videoIdError, setVideoIdError] = useState<string | null>(null);

  // Settings
  const [importEnabled, setImportEnabled] = useState(true);
  const [pollFallbackEnabled, setPollFallbackEnabled] = useState(true);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [minCapacity, setMinCapacity] = useState(10);
  const [maxCapacity, setMaxCapacity] = useState(100);
  const [defaultCap, setDefaultCap] = useState(10);
  const [inactivityTimeoutSec, setInactivityTimeoutSec] = useState(120);
  const [manualOverride, setManualOverride] = useState<string>('');
  const [pollingIntervalSec, setPollingIntervalSec] = useState(60);
  const [quotaBudget, setQuotaBudget] = useState(10000);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Force Reconnect & Reset Session
  const [reconnecting, setReconnecting] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [resettingQuota, setResettingQuota] = useState(false);

  // Chat Wipe (Requirement 4)
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [chatClearSuccess, setChatClearSuccess] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getYouTubeStatus();
      setConfig(data.config);
      setState(data.state);
      setMetrics(data.metrics);
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }

      setVideoIdInput(data.config?.videoId || '');
      setImportEnabled(data.config?.importEnabled ?? true);
      setPollFallbackEnabled(data.config?.pollFallbackEnabled ?? true);
      setAdaptiveEnabled(data.config?.adaptiveEnabled ?? true);
      setMinCapacity(data.config?.minimumCapacity ?? 10);
      setMaxCapacity(data.config?.maximumCapacity ?? 100);
      setDefaultCap(data.config?.defaultCapacity ?? 10);
      setInactivityTimeoutSec(Math.round((data.config?.inactivityTimeoutMs ?? 120000) / 1000));
      setManualOverride(data.config?.manualCapacityOverride ? String(data.config.manualCapacityOverride) : '');
      setPollingIntervalSec(data.config?.pollingIntervalSeconds ?? 60);
      setQuotaBudget(data.config?.quotaDailyBudget ?? 10000);
    } catch (err: any) {
      console.error('Failed to load YouTube status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const unsubStatus = adminSocket.on('youtube:status_update', (newState) => {
      setState(newState);
    });

    const unsubMetrics = adminSocket.on('youtube:metrics_update', (newMetrics) => {
      setMetrics(newMetrics);
    });

    return () => {
      unsubStatus();
      unsubMetrics();
    };
  }, []);

  const handleSaveVideoId = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVideoId(true);
    setVideoIdError(null);
    setVideoIdSuccess(false);

    try {
      const res = await adminApi.updateYouTubeVideoId(videoIdInput.trim());
      setState(res.state);
      setConfig(res.config);
      setVideoIdSuccess(true);
      setTimeout(() => setVideoIdSuccess(false), 4000);
      fetchStatus();
    } catch (err: any) {
      setVideoIdError(err.message);
    } finally {
      setSavingVideoId(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);

    try {
      const overrideVal = manualOverride.trim() ? parseInt(manualOverride.trim(), 10) : null;
      const res = await adminApi.updateYouTubeSettings({
        importEnabled,
        pollFallbackEnabled,
        adaptiveEnabled,
        minimumCapacity: Number(minCapacity),
        maximumCapacity: Number(maxCapacity),
        defaultCapacity: Number(defaultCap),
        manualCapacityOverride: overrideVal,
        inactivityTimeoutMs: Number(inactivityTimeoutSec) * 1000,
        pollingIntervalSeconds: Number(pollingIntervalSec),
        quotaDailyBudget: Number(quotaBudget)
      });
      setConfig(res.config);
      if (res.state) setState(res.state);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 4000);
      fetchStatus();
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetQuota = async () => {
    if (!confirm('Reset quota exhaustion flag? Requests will resume using the configured polling interval.')) {
      return;
    }
    setResettingQuota(true);
    try {
      const res = await adminApi.resetYouTubeQuota();
      setState(res.state);
      await fetchStatus();
    } catch (err: any) {
      alert(`Reset quota error: ${err.message}`);
    } finally {
      setResettingQuota(false);
    }
  };

  const handleConfirmClearChat = async () => {
    setClearingChat(true);
    try {
      await adminApi.clearChatHistory();
      setChatClearSuccess(true);
      setShowClearModal(false);
      setTimeout(() => setChatClearSuccess(false), 4000);
      fetchStatus();
    } catch (err: any) {
      alert(`Failed to wipe chat: ${err.message}`);
    } finally {
      setClearingChat(false);
    }
  };

  const handleForceReconnect = async () => {
    setReconnecting(true);
    try {
      const res = await adminApi.reconnectYouTube();
      setState(res.state);
    } catch (err: any) {
      alert(`Reconnect error: ${err.message}`);
    } finally {
      setReconnecting(false);
    }
  };

  const handleResetSession = async () => {
    if (!confirm('Start fresh participant admission session? This will release current active slots and clear temporary YouTube identities.')) {
      return;
    }
    setResettingSession(true);
    try {
      const res = await adminApi.resetYouTubeSession();
      setState(res.state);
      await fetchStatus();
    } catch (err: any) {
      alert(`Reset error: ${err.message}`);
    } finally {
      setResettingSession(false);
    }
  };

  // Status badge helpers
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return { label: 'LIVE & CONNECTED', color: 'bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/40 animate-pulse' };
      case 'DISCOVERING_CHAT':
        return { label: 'DISCOVERING CHAT', color: 'bg-[#00f0ff]/20 text-[#00f0ff] border-[#00f0ff]/40 animate-pulse' };
      case 'WAITING_FOR_LIVESTREAM':
        return { label: 'WAITING FOR BROADCAST', color: 'bg-[#ffaa00]/20 text-[#ffaa00] border-[#ffaa00]/40' };
      case 'GAME_SCOPE_GATE_CLOSED':
        return { label: 'MASTER GATE CLOSED (>=10 VISITORS)', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'IMPORT_DISABLED':
        return { label: 'IMPORTS PAUSED BY ADMIN', color: 'bg-slate-700/30 text-slate-400 border-slate-600/30' };
      case 'STREAM_ENDED':
        return { label: 'LIVESTREAM CONCLUDED', color: 'bg-red-500/20 text-red-400 border-red-500/40' };
      case 'QUOTA_EXHAUSTED':
      case 'QUOTA_ERROR':
        return { label: 'API QUOTA EXHAUSTED', color: 'bg-rose-500/20 text-rose-300 border-rose-500/50' };
      case 'POLLING':
        return { label: 'POLLING YOUTUBE...', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse' };
      case 'WAITING':
        return { label: 'WAITING (NEXT POLL)', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'API_ERROR':
        return { label: 'API ERROR', color: 'bg-red-500/20 text-red-400 border-red-500/40' };
      case 'RECONNECTING':
        return { label: 'RECONNECTING...', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' };
      case 'NOT_CONFIGURED':
      default:
        return { label: 'NOT CONFIGURED', color: 'bg-slate-800 text-slate-400 border-white/10' };
    }
  };

  const statusInfo = getStatusBadge(state?.status || 'NOT_CONFIGURED');
  const activityLevel = metrics?.activityLevel || 'QUIET';

  return (
    <div className="space-y-8">
      
      {/* 1. TOP HERO HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#0d111a] border border-white/10">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
            <Youtube className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="font-display font-black text-xl text-white uppercase tracking-wider">
                YOUTUBE LIVE CHAT & AUDIENCE CONTROLLER
              </h2>
              <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Dual-Audience Ingestion // GTA Identity Namespace // Master 10-Visitor Gate Protected
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleResetSession}
            disabled={resettingSession}
            title="Clean up stream admission session and clear temporary YouTube identity mappings"
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900 border border-purple-500/30 text-xs font-mono text-purple-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resettingSession ? 'animate-spin' : ''}`} />
            <span>RESET STREAM ROSTER</span>
          </button>
          <button
            onClick={handleForceReconnect}
            disabled={reconnecting}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg transition-all"
          >
            <Radio className={`w-3.5 h-3.5 ${reconnecting ? 'animate-spin' : ''}`} />
            <span>FORCE RECONNECT</span>
          </button>
        </div>
      </div>

      {/* 2. REALTIME AUDIENCE & CAPACITY METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Metric 1: Activity Level */}
        <div className="p-4 rounded-xl bg-[#0d111a] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVITY LEVEL</span>
            <Activity className="w-4 h-4 text-[#00f0ff]" />
          </div>
          <div className="font-display font-black text-2xl tracking-wider text-white flex items-center space-x-2">
            <span>{activityLevel}</span>
            {metrics?.trend === 'SCALING_UP' && <TrendingUp className="w-4 h-4 text-[#00ff88]" />}
            {metrics?.trend === 'SCALING_DOWN' && <TrendingDown className="w-4 h-4 text-[#ffaa00]" />}
            {metrics?.trend === 'STABLE' && <Minus className="w-4 h-4 text-slate-500" />}
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            {metrics?.messagesPerMinute || 0} msgs/min ({metrics?.messageVelocityPerSec || 0}/sec)
          </p>
        </div>

        {/* Metric 2: Admitted YouTube Participants */}
        <div className="p-4 rounded-xl bg-[#0d111a] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ADMITTED AUDIENCE</span>
            <Users className="w-4 h-4 text-[#00ff88]" />
          </div>
          <div className="font-display font-black text-2xl tracking-wider text-white">
            <span className="text-[#00ff88]">{metrics?.admittedParticipantCount || 0}</span>
            <span className="text-slate-500 text-lg"> / {metrics?.currentCapacity || 10}</span>
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            {metrics?.uniqueChattersInWindow || 0} unique chatters in window
          </p>
        </div>

        {/* Metric 3: Master Gate State */}
        <div className="p-4 rounded-xl bg-[#0d111a] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>MASTER GATE (10-VISITOR)</span>
            <ShieldAlert className={`w-4 h-4 ${metrics?.masterGateOpen ? 'text-[#00ff88]' : 'text-purple-400'}`} />
          </div>
          <div className="font-display font-black text-lg tracking-wider">
            {metrics?.masterGateOpen ? (
              <span className="text-[#00ff88]">OPEN (IMPORTS OK)</span>
            ) : (
              <span className="text-purple-400">CLOSED (&ge;10 VISITORS)</span>
            )}
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Current website visitors: <strong>{metrics?.activeGameScopeVisitors ?? 0}</strong>
          </p>
        </div>

        {/* Metric 4: Total Imported Messages */}
        <div className="p-4 rounded-xl bg-[#0d111a] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>IMPORTED MESSAGES</span>
            <Zap className="w-4 h-4 text-[#ffaa00]" />
          </div>
          <div className="font-display font-black text-2xl tracking-wider text-white">
            {(state?.importedMessageCount || 0).toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Normalized to GameScope chat timeline
          </p>
        </div>

      </div>

      {/* 2.5 API QUOTA BUDGET & CONTINUOUS INGESTION TELEMETRY (Requirements 1, 4, 6) */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2.5">
            <Gauge className="w-5 h-5 text-[#ffaa00]" />
            <h3 className="font-display font-black text-base text-white tracking-wider">
              YOUTUBE API QUOTA BUDGET &amp; CONTINUOUS POLLING
            </h3>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className={`px-2.5 py-0.5 rounded font-bold border ${
              state?.isQuotaExhausted || state?.status === 'QUOTA_EXHAUSTED'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                : 'bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/40'
            }`}>
              {state?.isQuotaExhausted || state?.status === 'QUOTA_EXHAUSTED' ? 'QUOTA EXHAUSTED' : 'QUOTA HEALTHY'}
            </span>
            {(state?.isQuotaExhausted || state?.status === 'QUOTA_EXHAUSTED') && (
              <button
                type="button"
                onClick={handleResetQuota}
                disabled={resettingQuota}
                className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors text-[11px]"
              >
                {resettingQuota ? 'RESETTING...' : 'RESET QUOTA STATUS'}
              </button>
            )}
          </div>
        </div>

        {/* Quota Exhausted Banner */}
        {(state?.isQuotaExhausted || state?.status === 'QUOTA_EXHAUSTED') && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-mono text-rose-300 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-white block">API Quota Exhausted &mdash; Polling Paused</strong>
              <p>
                Requests have been safely stopped to preserve the continuation token and worker state. The system will resume automatically at midnight UTC when Google resets the daily quota.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Progress Bar & Today's Usage */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>DAILY USAGE (UTC {state?.quotaDay || 'TODAY'})</span>
              <span className="text-white font-bold">
                {state?.quotaUsedToday ?? 0} / {state?.quotaDailyBudget ?? 10000} units
              </span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  (state?.quotaUsedToday || 0) >= (state?.quotaDailyBudget || 10000)
                    ? 'bg-rose-500'
                    : (state?.quotaUsedToday || 0) >= (state?.quotaDailyBudget || 10000) * 0.8
                    ? 'bg-amber-500'
                    : 'bg-[#00ff88]'
                }`}
                style={{
                  width: `${Math.min(100, Math.round(((state?.quotaUsedToday || 0) / (state?.quotaDailyBudget || 10000)) * 100))}%`
                }}
              />
            </div>
            <p className="text-[10px] font-mono text-slate-400">
              {Math.round(((state?.quotaUsedToday || 0) / (state?.quotaDailyBudget || 10000)) * 100)}% consumed &bull; {state?.requestsToday || 0} API calls today
            </p>
          </div>

          {/* Polling Delay Telemetry */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>CONTINUOUS POLLING DELAY</span>
              <Clock className="w-4 h-4 text-[#00f0ff]" />
            </div>
            <div className="font-display font-black text-xl text-white">
              <span>{state?.effectivePollingIntervalSeconds || 60}s</span>
              <span className="text-slate-500 text-xs ml-2 font-mono font-normal">
                (Configured: {state?.configuredPollingIntervalSeconds || 60}s)
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400">
              Reliability-first &bull; Max(configured, YouTube suggestion)
            </p>
          </div>

          {/* 24-Hour Projected Consumption */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>ESTIMATED DAILY COST</span>
              <Gauge className="w-4 h-4 text-[#ffaa00]" />
            </div>
            <div className="font-display font-black text-xl text-white">
              <span>~{(state?.estimatedDailyCost || 7200).toLocaleString()}</span>
              <span className="text-slate-500 text-xs ml-1 font-mono font-normal">units/day</span>
            </div>
            <p className="text-[10px] font-mono text-slate-400">
              ~{Math.round(86400 / (state?.effectivePollingIntervalSeconds || 60)).toLocaleString()} requests/day @ 5 units/fetch
            </p>
          </div>
        </div>
      </div>

      {/* 3. VIDEO CONFIGURATION & CONNECTION STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Video ID Input & Selection Priority */}
        <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-5">
          <div className="border-b border-white/5 pb-3">
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <Youtube className="w-5 h-5 text-red-500" />
              <span>LIVESTREAM VIDEO SELECTION</span>
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Priority: 1. Admin Configured Video ID &rarr; 2. Environment Variable Default.
            </p>
          </div>

          <form onSubmit={handleSaveVideoId} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-1.5">
                Target YouTube Video ID / Livestream ID
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={videoIdInput}
                  onChange={(e) => setVideoIdInput(e.target.value)}
                  placeholder="e.g. BGUTv2K_SWs (Leave empty to use env default)"
                  className="flex-1 bg-black/60 border border-white/15 focus:border-[#00f0ff] rounded-xl px-4 py-2.5 text-white font-mono text-sm outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={savingVideoId}
                  className="px-5 py-2.5 rounded-xl bg-[#00f0ff] hover:bg-[#33f3ff] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider shadow-lg transition-all flex items-center space-x-1.5"
                >
                  {savingVideoId ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : videoIdSuccess ? (
                    <Check className="w-4 h-4" />
                  ) : null}
                  <span>{savingVideoId ? 'SAVING...' : videoIdSuccess ? 'SAVED!' : 'APPLY VIDEO ID'}</span>
                </button>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-1.5">
                Current active ID: <strong className="text-white font-mono">{state?.selectedVideoId || 'None'}</strong>{' '}
                <span className="text-slate-400">({state?.videoIdSource === 'ADMIN' ? 'Set by Admin' : state?.videoIdSource === 'ENVIRONMENT' ? 'Environment Fallback' : 'Not Configured'})</span>
              </p>
            </div>

            {videoIdError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-mono text-red-400 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{videoIdError}</span>
              </div>
            )}
          </form>

          {/* Connection Details Box */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>STREAM TITLE:</span>
              <span className="text-white truncate max-w-[280px]">{state?.streamTitle || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>CHANNEL:</span>
              <span className="text-white">{state?.channelTitle || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>ACTIVE LIVE CHAT ID:</span>
              <span className="text-cyan-400">{state?.liveChatId ? `Discovered (${state.liveChatId.substring(0, 14)}...)` : 'Not available'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>POLLING INTERVAL:</span>
              <span className="text-slate-200">
                {state?.configuredPollingIntervalSeconds || 60}s configured &bull; {state?.effectivePollingIntervalSeconds || 60}s actual
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>LAST SUCCESSFUL FETCH:</span>
              <span className="text-slate-200">
                {state?.lastSuccessfulFetch ? new Date(state.lastSuccessfulFetch).toLocaleTimeString() : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>CONTINUATION TOKEN:</span>
              <span className="text-[#00ff88]">
                {state?.nextPageToken ? `Active (${state.nextPageToken.substring(0, 10)}...) [Persisted]` : 'Initial / Fresh'}
              </span>
            </div>
            {state?.lastImportedMessage && (
              <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-white/5">
                <span>LAST IMPORTED MSG:</span>
                <span className="text-slate-300 truncate max-w-[260px]" title={state.lastImportedMessage.text}>
                  &ldquo;{state.lastImportedMessage.text}&rdquo; by {state.lastImportedMessage.author}
                </span>
              </div>
            )}
            {state?.lastError && (
              <div className="pt-2 border-t border-white/5 text-red-400 text-[11px]">
                <strong>Error Note:</strong> {state.lastError}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ingestion & Adaptive Capacity Controls */}
        <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-5">
          <div className="border-b border-white/5 pb-3">
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-[#00ff88]" />
              <span>ADAPTIVE CAPACITY & INGESTION RULES</span>
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Configure dynamic participant admission & manual overrides.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            
            {/* Toggles (Requirement 2.A, 2.B, 2.D) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Chat Import</span>
                  <span className="text-[10px] font-mono text-slate-400">Ingest live messages</span>
                </div>
                <input
                  type="checkbox"
                  checked={importEnabled}
                  onChange={(e) => setImportEnabled(e.target.checked)}
                  className="w-5 h-5 accent-[#00ff88] rounded cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Poll Fallback</span>
                  <span className="text-[10px] font-mono text-slate-400">Show YT poll when no admin poll</span>
                </div>
                <input
                  type="checkbox"
                  checked={pollFallbackEnabled}
                  onChange={(e) => setPollFallbackEnabled(e.target.checked)}
                  className="w-5 h-5 accent-[#ffaa00] rounded cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">Adaptive Scaling</span>
                  <span className="text-[10px] font-mono text-slate-400">Auto-scale capacity</span>
                </div>
                <input
                  type="checkbox"
                  checked={adaptiveEnabled}
                  onChange={(e) => setAdaptiveEnabled(e.target.checked)}
                  className="w-5 h-5 accent-[#00f0ff] rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Capacity Controls (Requirement 2.C & 3) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Min Capacity
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={minCapacity}
                  onChange={(e) => setMinCapacity(parseInt(e.target.value, 10))}
                  className="w-full bg-black/60 border border-white/15 focus:border-[#00ff88] rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Max Capacity
                </label>
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(parseInt(e.target.value, 10))}
                  className="w-full bg-black/60 border border-white/15 focus:border-[#00ff88] rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Default Capacity
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={defaultCap}
                  onChange={(e) => setDefaultCap(parseInt(e.target.value, 10))}
                  className="w-full bg-black/60 border border-white/15 focus:border-[#00ff88] rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                />
              </div>
            </div>

            {/* Manual Override & Inactivity Timeout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Manual Capacity Override
                </label>
                <input
                  type="text"
                  value={manualOverride}
                  onChange={(e) => setManualOverride(e.target.value)}
                  placeholder="e.g. 25 (Empty for adaptive auto)"
                  className="w-full bg-black/60 border border-white/15 focus:border-[#ffaa00] rounded-xl px-3.5 py-2 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Inactivity Timeout (Seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="1800"
                  value={inactivityTimeoutSec}
                  onChange={(e) => setInactivityTimeoutSec(parseInt(e.target.value, 10))}
                  className="w-full bg-black/60 border border-white/15 focus:border-[#00ff88] rounded-xl px-3.5 py-2 text-white font-mono text-xs outline-none"
                />
              </div>
            </div>

            {/* Delayed Continuous Polling Interval & Quota Budget (Requirements 1, 4, 6) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/5">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Target Polling Delay (Seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={pollingIntervalSec}
                  onChange={(e) => setPollingIntervalSec(parseInt(e.target.value, 10))}
                  placeholder="60"
                  className="w-full bg-black/60 border border-white/15 focus:border-[#00f0ff] rounded-xl px-3.5 py-2 text-white font-mono text-xs outline-none"
                />
                <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                  Initial 60s default (30–90s continuous delay). Respects YouTube min interval.
                </span>
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Daily Quota Budget (Units)
                </label>
                <input
                  type="number"
                  min="1000"
                  max="50000"
                  value={quotaBudget}
                  onChange={(e) => setQuotaBudget(parseInt(e.target.value, 10))}
                  placeholder="10000"
                  className="w-full bg-black/60 border border-white/15 focus:border-[#ffaa00] rounded-xl px-3.5 py-2 text-white font-mono text-xs outline-none"
                />
                <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                  Stops requests when reached to preserve state &amp; token until UTC midnight.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[10px] font-mono text-slate-400">
                Slot Lease: {inactivityTimeoutSec}s silence releases active slot for next chatter
              </span>
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2 rounded-xl bg-[#00ff88] hover:bg-[#33ff9f] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider shadow-lg transition-all flex items-center space-x-1.5"
              >
                {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : settingsSuccess ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{savingSettings ? 'SAVING...' : settingsSuccess ? 'SETTINGS SAVED!' : 'SAVE SETTINGS'}</span>
              </button>
            </div>

          </form>
        </div>

      </div>

      {/* 4. CHAT MANAGEMENT (CLEAR CURRENT CHAT - Requirement 4) */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center space-x-2">
            <Trash2 className="w-4 h-4 text-red-500" />
            <span>CHAT MANAGEMENT // WIPE CHAT HISTORY</span>
          </h4>
          <p className="text-xs font-mono text-slate-400 mt-1 max-w-2xl">
            Instantly clears active chat display and persistent history for all connected viewers. YouTube stream connections, participant identities, and polls remain intact.
          </p>
          {chatClearSuccess && (
            <p className="text-xs font-mono text-[#00ff88] mt-1.5 flex items-center space-x-1">
              <Check className="w-3.5 h-3.5" />
              <span>Chat history wiped successfully across all connected viewports!</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowClearModal(true)}
          className="px-5 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg transition-all flex items-center space-x-2 flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
          <span>CLEAR CURRENT CHAT</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#0d121c] border border-red-500/40 shadow-[0_0_50px_rgba(239,68,68,0.3)] space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-display font-bold text-lg text-white">CONFIRM CHAT WIPE</h3>
            </div>
            <p className="text-sm font-mono text-slate-300 leading-relaxed">
              Clear the current chat history? New messages will continue appearing normally.
            </p>
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-400 space-y-1">
              <div>&bull; Clears visible chat on all connected client screens</div>
              <div>&bull; Removes past messages from persistent history</div>
              <div>&bull; YouTube connections & participant identities remain active</div>
            </div>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={clearingChat}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-mono text-xs uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearChat}
                disabled={clearingChat}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg flex items-center space-x-2"
              >
                {clearingChat && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{clearingChat ? 'WIPING CHAT...' : 'YES, CLEAR CHAT'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ADMITTED YOUTUBE AUDIENCE ROSTER */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <Users className="w-5 h-5 text-[#00f0ff]" />
              <span>DYNAMIC YOUTUBE PARTICIPANT ADMISSION ROSTER</span>
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Stream-scoped admission pool &bull; Slots dynamically replaced on inactivity &bull; Identities restored on return
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
              Active: {participants.filter(p => p.status === 'ACTIVE').length} / {metrics?.currentCapacity || 10}
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 border border-white/10">
              Released/Waiting: {participants.filter(p => p.status === 'RELEASED').length}
            </span>
          </div>
        </div>

        {participants.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-500 border border-dashed border-white/10 rounded-xl">
            No YouTube participants currently admitted for this stream session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Assigned GTA Identity</th>
                  <th className="py-2.5 px-3">Messages</th>
                  <th className="py-2.5 px-3">First Admitted</th>
                  <th className="py-2.5 px-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {participants.map((p) => (
                  <tr key={p.channelId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.status === 'ACTIVE' 
                          ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30' 
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {p.status === 'ACTIVE' ? 'ACTIVE SLOT' : 'RELEASED (WAITING)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white flex items-center space-x-2">
                      <div 
                        className="w-5 h-5 rounded-full flex items-center justify-center p-0.5" 
                        style={{ backgroundColor: `${p.assignedIdentity?.avatarColor || '#00f0ff'}20` }}
                        dangerouslySetInnerHTML={{ __html: p.assignedIdentity?.avatarSvg || '' }}
                      />
                      <span>{p.displayName}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{p.messageCount}</td>
                    <td className="py-2.5 px-3 text-slate-400">{new Date(p.firstAdmittedAt).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-3 text-slate-400">{new Date(p.lastActivityAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. ARCHITECTURAL SAFEGUARDS NOTICES */}
      <div className="p-5 rounded-2xl bg-[#090d14] border border-white/10 space-y-2">
        <h4 className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center space-x-2">
          <Layers className="w-4 h-4 text-[#ff2a85]" />
          <span>IDENTITY SYSTEM & SYSTEM INTEGRITY GUARANTEES</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono text-slate-400">
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-white font-bold block">GameScope Members</span>
            <p>Clean GTA-inspired names without numbers (e.g. <em>CrazyTommy</em>, <em>CuteCJ</em>). Exclusively reserved for authenticated site visitors.</p>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-[#ffaa00] font-bold block">YouTube Participants</span>
            <p>Mandatory numeric suffix (e.g. <em>CrazyTommy07</em>, <em>CuteCJ24</em>). Permanent per YouTube channel ID. Never receives clean names.</p>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-purple-400 font-bold block">Master Gate (&ge;10 Visitors)</span>
            <p>When GameScope active website visitors reach 10, YouTube imports halt immediately. No message buffering or replay occurs.</p>
          </div>
        </div>
      </div>

    </div>
  );
};
