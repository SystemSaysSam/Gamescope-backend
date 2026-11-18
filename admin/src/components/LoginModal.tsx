import React, { useState } from 'react';
import { Shield, KeyRound, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { adminApi } from '../services/adminApi';

interface LoginModalProps {
  onLoginSuccess: (email: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [adminSecret, setAdminSecret] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await adminApi.login({
        adminSecret: adminSecret.trim(),
        email: adminEmail.trim() || undefined
      });
      onLoginSuccess(res.admin?.email || 'admin@gamescope.live');
    } catch (err: any) {
      setError(err.message || 'Login failed. Check your administrative credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05070a]/90 backdrop-blur-xl">
      <div className="max-w-md w-full bg-[#0b0e17] border border-white/15 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,240,255,0.15)] relative">
        
        {/* Glow corner accents */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#ff2a85]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#00f0ff]/10 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#00f0ff]/15 border border-[#00f0ff]/40 mx-auto flex items-center justify-center text-[#00f0ff] shadow-[0_0_20px_rgba(0,240,255,0.25)]">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="font-display font-black text-2xl text-white tracking-wider uppercase">
            GAMESCOPE ADMIN AUTH
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Authorized Personnel Only // Leonida Broadcast Operations
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start space-x-2 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 flex items-center justify-between">
              <span>ADMINISTRATIVE EMAIL</span>
              <span className="text-[10px] text-slate-500">Authorized allowlist</span>
            </label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@gamescope.live"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 flex items-center justify-between">
              <span>MASTER ADMIN SECRET KEY</span>
              <KeyRound className="w-3.5 h-3.5 text-[#ffaa00]" />
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="Enter secret key..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#ff2a85] focus:ring-1 focus:ring-[#ff2a85] transition-all"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="text-[10px] font-mono text-slate-500 mt-1">
              Configured via ADMIN_SECRET in backend environment.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff2a85] to-[#ff4d9d] hover:brightness-110 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-[0_0_25px_rgba(255,42,133,0.3)] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span>VERIFYING CREDENTIALS...</span>
            ) : (
              <>
                <span>ENTER COMMAND CENTER</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/5 text-center text-[10px] font-mono text-slate-500">
          Security policy: All administrative actions are recorded in the immutable audit log.
        </div>

      </div>
    </div>
  );
};
