import React, { useState } from 'react';
import { 
  Radio, 
  Clock, 
  Youtube, 
  RefreshCw, 
  Check, 
  AlertTriangle 
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';

interface EventControlTabProps {
  config: any;
  onConfigUpdated: (newConfig: any) => void;
}

export const EventControlTab: React.FC<EventControlTabProps> = ({ config, onConfigUpdated }) => {
  const currentState = config?.state || 'UPCOMING';

  // State Transition Pending Confirmation Modal
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateSuccessMsg, setStateSuccessMsg] = useState<string | null>(null);

  // Countdown Form
  const [targetIso, setTargetIso] = useState<string>(() => {
    if (config?.countdown?.targetIso) {
      const d = new Date(config.countdown.targetIso);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    return '';
  });
  const [timezone, setTimezone] = useState(config?.countdown?.timezone || 'Asia/Kolkata');
  const [countdownLabel, setCountdownLabel] = useState(config?.countdown?.label || '4:30 PM IST');
  const [countdownSaving, setCountdownSaving] = useState(false);
  const [countdownSuccess, setCountdownSuccess] = useState(false);

  // Stream Form
  const [streamInput, setStreamInput] = useState(config?.youtubeVideoId || '');
  const [expectedDuration, setExpectedDuration] = useState(config?.expectedDurationMinutes || 360);
  const [streamSaving, setStreamSaving] = useState(false);
  const [streamSuccess, setStreamSuccess] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Force Sync State
  const [forceSyncing, setForceSyncing] = useState(false);
  const [forceSyncSuccess, setForceSyncSuccess] = useState(false);

  const states = [
    {
      id: 'UPCOMING',
      label: 'UPCOMING',
      desc: 'Countdown active. Permitted arcade playable. Pre-broadcast chat active.',
      color: 'border-[#00f0ff] text-[#00f0ff]'
    },
    {
      id: 'STARTING',
      label: 'STARTING',
      desc: 'Arcade locked. Background music fades to zero (2-3s). Starting soon banner.',
      color: 'border-[#ff2a85] text-[#ff2a85]'
    },
    {
      id: 'LIVE',
      label: 'LIVE',
      desc: 'YouTube livestream active. Automatically dispatches Web Push notification to all subscribers.',
      color: 'border-[#00ff88] text-[#00ff88]'
    },
    {
      id: 'BREAK',
      label: 'BREAK',
      desc: 'Intermission arcade ready. Chat active. Music restored if user enabled.',
      color: 'border-[#ffaa00] text-[#ffaa00]'
    },
    {
      id: 'ENDED',
      label: 'ENDED / INACTIVE',
      desc: 'Broadcast concluded. Editable inactive screen displayed. Arcade disabled.',
      color: 'border-red-500 text-red-400'
    }
  ];

  const handleTriggerStateChange = (stateId: string) => {
    if (stateId === currentState) return;
    setPendingState(stateId);
  };

  const confirmStateChange = async () => {
    if (!pendingState) return;
    setStateLoading(true);
    try {
      const res = await adminApi.updateEventState(pendingState);
      onConfigUpdated(res.config);
      const switchedTo = pendingState;
      setPendingState(null);
      if (switchedTo === 'LIVE') {
        setStateSuccessMsg('🔴 LIVE STREAM ACTIVATED — Automatic Web Push notification dispatched to all eligible devices!');
      } else {
        setStateSuccessMsg(`Event state successfully transitioned to ${switchedTo}.`);
      }
      setTimeout(() => setStateSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(`Failed to update state: ${err.message}`);
    } finally {
      setStateLoading(false);
    }
  };

  const handleSaveCountdown = async (e: React.FormEvent) => {
    e.preventDefault();
    setCountdownSaving(true);
    setCountdownSuccess(false);

    try {
      const dateObj = new Date(targetIso);
      const res = await adminApi.updateCountdown({
        targetIso: dateObj.toISOString(),
        timezone,
        label: countdownLabel
      });
      onConfigUpdated(res.config);
      setCountdownSuccess(true);
      setTimeout(() => setCountdownSuccess(false), 4000);
    } catch (err: any) {
      alert(`Countdown update failed: ${err.message}`);
    } finally {
      setCountdownSaving(false);
    }
  };

  const handleSaveStream = async (e: React.FormEvent) => {
    e.preventDefault();
    setStreamSaving(true);
    setStreamSuccess(false);
    setStreamError(null);

    try {
      const res = await adminApi.updateStream({
        streamUrlOrId: streamInput,
        expectedDurationMinutes: parseInt(String(expectedDuration), 10)
      });
      onConfigUpdated(res.config);
      setStreamSuccess(true);
      setTimeout(() => setStreamSuccess(false), 4000);
    } catch (err: any) {
      setStreamError(err.message);
    } finally {
      setStreamSaving(false);
    }
  };

  const handleForceSync = async () => {
    setForceSyncing(true);
    setForceSyncSuccess(false);
    try {
      const res = await adminApi.forceSync();
      onConfigUpdated(res.config);
      setForceSyncSuccess(true);
      setTimeout(() => setForceSyncSuccess(false), 4000);
    } catch (err: any) {
      alert(`Force sync failed: ${err.message}`);
    } finally {
      setForceSyncing(false);
    }
  };

  return (
    <div className="space-y-8">

      {/* State Change Success Alert Banner */}
      {stateSuccessMsg && (
        <div className="p-4 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/40 flex items-center space-x-3 text-[#00ff88] animate-in fade-in duration-300">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider">{stateSuccessMsg}</span>
        </div>
      )}
      
      {/* 1. STATE MACHINE CONTROLS */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div>
            <h3 className="font-display font-black text-xl text-white tracking-wider flex items-center space-x-2">
              <Radio className="w-5 h-5 text-[#ff2a85]" />
              <span>SERVER-AUTHORITATIVE EVENT STATE</span>
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Transitions update all connected public viewports in realtime via WebSockets.
            </p>
          </div>
          
          <button
            onClick={handleForceSync}
            disabled={forceSyncing}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-[#00f0ff] border border-cyan-500/30 text-xs font-mono font-bold transition-all"
            title="Forces all public clients to re-synchronize state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${forceSyncing ? 'animate-spin' : ''}`} />
            <span>{forceSyncSuccess ? 'SYNC BROADCASTED!' : 'FORCE SYNC ALL CLIENTS'}</span>
          </button>
        </div>

        {/* 5 States Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {states.map(s => {
            const isCurrent = currentState === s.id;
            return (
              <div
                key={s.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  isCurrent 
                    ? `bg-black/60 shadow-lg ${s.color} border-2`
                    : 'bg-black/30 border-white/10 hover:border-white/30 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-black text-lg tracking-wider text-white">
                      {s.label}
                    </span>
                    {isCurrent && (
                      <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] font-sans leading-snug text-slate-300">
                    {s.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5">
                  {isCurrent ? (
                    <span className="text-[10px] font-mono font-bold text-[#00ff88] uppercase block text-center py-1">
                      CURRENT ACTIVE STATE
                    </span>
                  ) : (
                    <button
                      onClick={() => handleTriggerStateChange(s.id)}
                      className="w-full py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/15 text-white font-mono text-xs font-bold transition-all"
                    >
                      SWITCH TO {s.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. COUNTDOWN & TIMING MANAGEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Countdown Editor */}
        <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <Clock className="w-5 h-5 text-[#ffaa00]" />
              <span>COUNTDOWN TARGET MANAGEMENT</span>
            </h3>
            {countdownSuccess && (
              <span className="flex items-center space-x-1 text-xs font-mono text-[#00ff88]">
                <Check className="w-3.5 h-3.5" />
                <span>SAVED & PUBLISHED</span>
              </span>
            )}
          </div>

          <form onSubmit={handleSaveCountdown} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                TARGET DATE & LOCAL TIME
              </label>
              <input
                type="datetime-local"
                required
                value={targetIso}
                onChange={(e) => setTargetIso(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  TIMEZONE
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC (Universal)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="Europe/London">Europe/London (BST/GMT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  DISPLAY LABEL (HERO BADGE)
                </label>
                <input
                  type="text"
                  required
                  value={countdownLabel}
                  onChange={(e) => setCountdownLabel(e.target.value)}
                  placeholder="e.g. 4:30 PM IST"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={countdownSaving}
              className="w-full py-2.5 rounded-xl bg-[#00f0ff] hover:bg-[#33f3ff] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {countdownSaving ? 'PUBLISHING TO CLIENTS...' : 'SAVE & PUBLISH COUNTDOWN'}
            </button>
          </form>
        </div>

        {/* 3. YOUTUBE STREAM MANAGEMENT */}
        <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <Youtube className="w-5 h-5 text-red-400" />
              <span>YOUTUBE LIVESTREAM EMBED</span>
            </h3>
            {streamSuccess && (
              <span className="flex items-center space-x-1 text-xs font-mono text-[#00ff88]">
                <Check className="w-3.5 h-3.5" />
                <span>UPDATED & BROADCAST</span>
              </span>
            )}
          </div>

          {streamError && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-mono">
              {streamError}
            </div>
          )}

          <form onSubmit={handleSaveStream} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                YOUTUBE STREAM URL OR 11-CHAR VIDEO ID
              </label>
              <input
                type="text"
                required
                value={streamInput}
                onChange={(e) => setStreamInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=QdBZY2fkU-0 or QdBZY2fkU-0"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#ff2a85]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                EXPECTED DURATION (MINUTES)
              </label>
              <input
                type="number"
                min="15"
                max="1440"
                value={expectedDuration}
                onChange={(e) => setExpectedDuration(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#ff2a85]"
              />
            </div>

            <button
              type="submit"
              disabled={streamSaving}
              className="w-full py-2.5 rounded-xl bg-[#ff2a85] hover:bg-[#ff4d9d] text-white font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {streamSaving ? 'UPDATING PLAYER STREAM...' : 'SAVE & PUBLISH STREAM SOURCE'}
            </button>
          </form>

          {/* Player Live Embed Mini Preview */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <span className="text-[10px] font-mono text-slate-400 block mb-2">LIVE EMBED VERIFICATION</span>
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${config?.youtubeVideoId || 'QdBZY2fkU-0'}?controls=1&rel=0`}
                title="Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>

      </div>

      {/* CONFIRMATION MODAL FOR HIGH-IMPACT TRANSITION */}
      {pendingState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="max-w-md w-full bg-[#0b0e17] border border-white/20 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-[#ffaa00]">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h4 className="font-display font-black text-xl text-white uppercase tracking-wider">
                CONFIRM STATE TRANSITION
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              You are about to switch the authoritative event state from{' '}
              <strong className="text-white font-mono">{currentState}</strong> to{' '}
              <strong className="text-[#00f0ff] font-mono">{pendingState}</strong>.
            </p>

            <div className="p-3 rounded-xl bg-black/50 border border-white/10 text-[11px] font-mono text-slate-400">
              {pendingState === 'STARTING' && '⚠️ Starting state will immediately shut down active arcade sessions and fade background music.'}
              {pendingState === 'LIVE' && '🔴 LIVE state will activate the YouTube livestream for all viewers and AUTOMATICALLY send instant Web Push notifications to all subscribed devices!'}
              {pendingState === 'BREAK' && '⚠️ Break state will enable the intermission arcade experience.'}
              {pendingState === 'ENDED' && '⚠️ Ended state will display the inactive screen message and close gameplay.'}
              {pendingState === 'UPCOMING' && '⚠️ Upcoming state will restore countdown and waiting screen.'}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => setPendingState(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs font-bold"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={stateLoading}
                onClick={confirmStateChange}
                className="px-4 py-2 rounded-xl bg-[#ff2a85] hover:bg-[#ff4d9d] text-white font-mono text-xs font-bold uppercase tracking-wider shadow-lg"
              >
                {stateLoading ? 'PUBLISHING...' : `CONFIRM TRANSITION TO ${pendingState}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
