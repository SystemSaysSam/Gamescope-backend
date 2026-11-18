import React, { useState, useEffect } from 'react';
import { Gamepad2, Trash2, Search, RefreshCw, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { adminSocket } from '../../services/adminSocket';

export const ArcadeTab: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'leaderboard' | 'sessions'>('leaderboard');

  const fetchData = async () => {
    setLoading(true);
    try {
      const lb = await adminApi.getArcadeLeaderboard();
      setLeaderboard(lb.leaderboard || []);
      const sess = await adminApi.getArcadeSessions();
      setSessions(sess.sessions || []);
    } catch (err: any) {
      console.error('Error fetching arcade data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsub = adminSocket.on('arcade:leaderboard_updated', (updatedLb) => {
      setLeaderboard(updatedLb || []);
    });

    return () => {
      unsub();
    };
  }, []);

  const handleInvalidateScore = async (scoreId: string) => {
    if (!confirm('Are you sure you want to invalidate and remove this score from the leaderboard?')) return;
    try {
      await adminApi.invalidateScore(scoreId);
      setLeaderboard(prev => prev.filter(s => s.id !== scoreId));
      alert('Score invalidated.');
    } catch (err: any) {
      alert(`Invalidation failed: ${err.message}`);
    }
  };

  const handleResetLeaderboard = async () => {
    if (!confirm('DANGER: Are you sure you want to reset the entire arcade leaderboard? This action cannot be undone.')) return;
    try {
      await adminApi.resetLeaderboard();
      setLeaderboard([]);
      alert('Leaderboard reset complete.');
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  const filteredLeaderboard = leaderboard.filter(e => 
    !searchQuery || 
    e.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    e.playerId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d111a] border border-white/10">
        <div>
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider flex items-center space-x-2">
            <Gamepad2 className="w-5 h-5 text-[#ff2a85]" />
            <span>VICE CITY RUN ARCADE & LEADERBOARD MANAGEMENT</span>
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Server-side run validation ($v_{`\\max`} = 64$ m/s bounds check) and competitive distance records.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleResetLeaderboard}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-mono font-bold"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>RESET LEADERBOARD</span>
          </button>
        </div>
      </div>

      {/* Subtab Toggle & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubTab('leaderboard')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
              activeSubTab === 'leaderboard'
                ? 'bg-[#ff2a85]/20 text-[#ff2a85] border border-[#ff2a85]/40'
                : 'text-slate-400 hover:text-white bg-black/40'
            }`}
          >
            Official Leaderboard ({leaderboard.length})
          </button>
          <button
            onClick={() => setActiveSubTab('sessions')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
              activeSubTab === 'sessions'
                ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/40'
                : 'text-slate-400 hover:text-white bg-black/40'
            }`}
          >
            Recent Sessions ({sessions.length})
          </button>
        </div>

        {activeSubTab === 'leaderboard' && (
          <div className="relative min-w-[240px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search player or username..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#ff2a85]"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Main Content Table */}
      {activeSubTab === 'leaderboard' ? (
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2.5 px-3">RANK</th>
                <th className="py-2.5 px-3">DRIVER</th>
                <th className="py-2.5 px-3">DISTANCE (METERS)</th>
                <th className="py-2.5 px-3">BADGE</th>
                <th className="py-2.5 px-3">DATE / TIME</th>
                <th className="py-2.5 px-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLeaderboard.length > 0 ? (
                filteredLeaderboard.map((entry, idx) => (
                  <tr key={entry.id || idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        entry.rank === 1 ? 'bg-[#ffaa00]/20 text-[#ffaa00]' :
                        entry.rank === 2 ? 'bg-slate-300/20 text-slate-200' :
                        entry.rank === 3 ? 'bg-amber-700/20 text-amber-500' :
                        'text-slate-400'
                      }`}>
                        #{entry.rank || idx + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-white">{entry.username}</span>
                      <span className="block text-[10px] text-slate-500 font-normal">{entry.playerId}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-[#00f0ff] text-sm">
                        {entry.score?.toLocaleString()} m
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {entry.badge ? (
                        <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold text-[10px]">
                          {entry.badge}
                        </span>
                      ) : (
                        <span className="text-slate-600">–</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : 'Recent'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleInvalidateScore(entry.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                        title="Invalidate score"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                    No leaderboard records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2.5 px-3">SESSION ID</th>
                <th className="py-2.5 px-3">PLAYER</th>
                <th className="py-2.5 px-3">STATUS</th>
                <th className="py-2.5 px-3">STARTED</th>
                <th className="py-2.5 px-3">LAST HEARTBEAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions.length > 0 ? (
                sessions.map((s) => (
                  <tr key={s.sessionId} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-3 text-[#00f0ff]">{s.sessionId}</td>
                    <td className="py-3 px-3 text-white font-bold">{s.playerName}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                        s.completed ? 'bg-slate-700 text-slate-300' : 'bg-[#00ff88]/20 text-[#00ff88]'
                      }`}>
                        {s.completed ? 'COMPLETED' : 'ACTIVE RUN'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{new Date(s.startedAt).toLocaleTimeString()}</td>
                    <td className="py-3 px-3 text-slate-400">{new Date(s.lastHeartbeat).toLocaleTimeString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                    No recent sessions recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
