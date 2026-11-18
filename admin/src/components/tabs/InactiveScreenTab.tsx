import React, { useState } from 'react';
import { FileText, Check, Eye } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

interface InactiveScreenTabProps {
  config: any;
  onConfigUpdated: (newConfig: any) => void;
}

export const InactiveScreenTab: React.FC<InactiveScreenTabProps> = ({ config, onConfigUpdated }) => {
  const currentInactive = config?.inactiveScreen || {};

  const [enabled, setEnabled] = useState(currentInactive.enabled ?? true);
  const [heading, setHeading] = useState(currentInactive.heading || 'THE BROADCAST HAS CONCLUDED');
  const [description, setDescription] = useState(currentInactive.description || 'Thank you for tuning in to the GameScope Live premiere event. Replay highlights and full breakdowns will be released shortly.');
  const [secondaryMessage, setSecondaryMessage] = useState(currentInactive.secondaryMessage || 'Follow GameScope Live for future premiere events and live community coverage.');
  
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const res = await adminApi.updateInactiveScreen({
        enabled,
        heading,
        description,
        secondaryMessage
      });
      onConfigUpdated(res.config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      alert(`Failed to save inactive screen: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      {/* Editor Column */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 className="font-display font-black text-xl text-white tracking-wider flex items-center space-x-2">
            <FileText className="w-5 h-5 text-[#00f0ff]" />
            <span>ENDED / INACTIVE SCREEN CONTENT EDITOR</span>
          </h3>
          {success && (
            <span className="flex items-center space-x-1 text-xs font-mono text-[#00ff88]">
              <Check className="w-3.5 h-3.5" />
              <span>SAVED & PUBLISHED</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-black/40 border border-white/10">
            <div>
              <span className="text-xs font-mono font-bold text-white block">ENABLE INACTIVE SCREEN</span>
              <span className="text-[10px] font-mono text-slate-400">
                Displays this messaging when stream state is set to ENDED
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00f0ff]"></div>
            </label>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">
              PRIMARY HEADLINE
            </label>
            <input
              type="text"
              required
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="e.g. THE BROADCAST HAS CONCLUDED"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">
              PRIMARY DESCRIPTION
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed conclusion message..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-sans text-xs focus:outline-none focus:border-[#00f0ff]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">
              SECONDARY MESSAGE (OPTIONAL CALL TO ACTION)
            </label>
            <input
              type="text"
              value={secondaryMessage}
              onChange={(e) => setSecondaryMessage(e.target.value)}
              placeholder="e.g. Follow GameScope Live for future premiere events..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-sans text-xs focus:outline-none focus:border-[#00f0ff]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#00f0ff] hover:bg-[#33f3ff] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {saving ? 'PUBLISHING TO CLIENTS...' : 'SAVE & PUBLISH INACTIVE SCREEN'}
          </button>
        </form>
      </div>

      {/* Live Preview Column */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
          <Eye className="w-4 h-4 text-[#ff2a85]" />
          <span>PUBLIC FRONTEND PREVIEW (MEDIA STAGE VIEWPORT)</span>
        </div>

        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-[#080b11] border border-white/15 flex flex-col items-center justify-center p-6 text-center shadow-2xl">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080b11] via-black/70 to-[#080b11]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:100%_4px] opacity-25 pointer-events-none" />

          <div className="relative z-10 max-w-md space-y-3 px-4">
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span>EVENT CONCLUDED</span>
            </div>

            <h2 className="font-display font-black text-xl sm:text-2xl text-white tracking-wider uppercase leading-tight">
              {heading || 'THE BROADCAST HAS CONCLUDED'}
            </h2>

            <p className="text-xs text-slate-300 font-light leading-relaxed">
              {description || 'Thank you for tuning in to the premiere event.'}
            </p>

            {secondaryMessage && (
              <p className="text-[11px] text-[#00f0ff] font-mono pt-2 border-t border-white/10">
                {secondaryMessage}
              </p>
            )}
          </div>
        </div>

        <p className="text-[11px] font-mono text-slate-400">
          Note: In the public frontend, background music transitions smoothly according to user preference without unexpected resets.
        </p>
      </div>

    </div>
  );
};
