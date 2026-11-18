import React, { useState, useEffect } from 'react';
import { Vote, Plus, Lock, BarChart2, RefreshCw, Clock, Trash2 } from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { adminSocket } from '../../services/adminSocket';

export const PollsTab: React.FC = () => {
  const [activePoll, setActivePoll] = useState<any | null>(null);
  const [pollHistory, setPollHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Create Poll Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [createLoading, setCreateLoading] = useState(false);

  const fetchPolls = async () => {
    setLoading(true);
    try {
      const publicCfg = await adminApi.getPublicConfig();
      setActivePoll(publicCfg.activePoll || null);

      const hist = await adminApi.getPollHistory();
      setPollHistory(hist.polls || []);
    } catch (err: any) {
      console.error('Error fetching polls:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolls();

    const unsubResults = adminSocket.on('poll:results', (updatedPoll) => {
      setActivePoll(updatedPoll);
    });

    const unsubCreated = adminSocket.on('poll:created', (newPoll) => {
      setActivePoll(newPoll);
      setPollHistory(prev => [newPoll, ...prev]);
    });

    const unsubClosed = adminSocket.on('poll:closed', (closedPoll) => {
      setActivePoll(closedPoll);
      setPollHistory(prev => prev.map(p => p.id === closedPoll.id ? closedPoll : p));
    });

    const unsubRemoved = adminSocket.on('poll:removed', () => {
      setActivePoll(null);
    });

    return () => {
      unsubResults();
      unsubCreated();
      unsubClosed();
      unsubRemoved();
    };
  }, []);

  const handleAddOptionField = () => {
    if (options.length < 5) {
      setOptions([...options, '']);
    }
  };

  const handleOptionChange = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOpts = options.map(o => o.trim()).filter(Boolean);
    if (cleanOpts.length < 2) {
      alert('A poll requires at least 2 valid options.');
      return;
    }
    setCreateLoading(true);

    try {
      const res = await adminApi.createPoll({
        question: question.trim(),
        options: cleanOpts,
        durationMinutes: durationMinutes > 0 ? durationMinutes : undefined
      });
      setActivePoll(res.poll);
      setIsCreateOpen(false);
      setQuestion('');
      setOptions(['', '']);
      alert('New Live Poll published to community chat!');
    } catch (err: any) {
      alert(`Create poll failed: ${err.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleClosePoll = async () => {
    if (!activePoll || activePoll.status === 'closed') return;
    if (!confirm('Are you sure you want to close voting on this poll?')) return;

    try {
      const res = await adminApi.closePoll(activePoll.id);
      setActivePoll(res.poll);
      alert('Poll closed. Final results published.');
    } catch (err: any) {
      alert(`Close poll failed: ${err.message}`);
    }
  };

  const handleRemovePoll = async () => {
    if (!activePoll) return;
    if (!confirm('Are you sure you want to completely remove this live poll from the site? It will immediately disappear from viewers\' chat.')) return;

    try {
      await adminApi.removePoll(activePoll.id);
      setActivePoll(null);
      alert('Live poll successfully removed from the site.');
    } catch (err: any) {
      alert(`Remove poll failed: ${err.message}`);
    }
  };

  const totalVotes = activePoll?.totalVotes || 0;

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d111a] border border-white/10">
        <div>
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider flex items-center space-x-2">
            <Vote className="w-5 h-5 text-[#00f0ff]" />
            <span>NORMAL COMMUNITY LIVE POLLS</span>
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Realtime audience voting integrated directly into the chat pinned area. Non-gambling, non-prediction.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchPolls}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#00f0ff] hover:bg-[#33f3ff] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>CREATE NEW POLL</span>
          </button>
        </div>
      </div>

      {/* Active Poll Card */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-5 h-5 text-[#00ff88]" />
            <h3 className="font-display font-black text-lg text-white tracking-wider uppercase">
              ACTIVE POLL STATUS
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
              activePoll?.status === 'active' 
                ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {activePoll?.status || 'NONE'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {activePoll && activePoll.status === 'active' && (
              <button
                onClick={handleClosePoll}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-mono font-bold"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>CLOSE VOTING</span>
              </button>
            )}

            {activePoll && (
              <button
                onClick={handleRemovePoll}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold transition-all"
                title="Remove this poll from the live site completely"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>REMOVE POLL</span>
              </button>
            )}
          </div>
        </div>

        {activePoll ? (
          <div className="space-y-4 max-w-2xl">
            <h4 className="font-display font-bold text-lg text-white">
              {activePoll.question}
            </h4>

            {/* Visual Bar Options */}
            <div className="space-y-2.5">
              {activePoll.options?.map((opt: any, idx: number) => {
                const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                return (
                  <div key={opt.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-200">{opt.text}</span>
                      <span className="text-[#00f0ff] font-bold">
                        {opt.votes?.toLocaleString()} votes ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-black/60 overflow-hidden border border-white/10">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          idx === 0 ? 'bg-[#00f0ff]' : idx === 1 ? 'bg-[#ff2a85]' : 'bg-[#00ff88]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>TOTAL BALLOTS CAST: <strong className="text-white">{totalVotes.toLocaleString()}</strong></span>
              {activePoll.deadlineIso && (
                <span>CLOSES: {new Date(activePoll.deadlineIso).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs font-mono text-slate-500 py-6 italic text-center">
            No active poll configured. Click 'Create New Poll' above to launch one.
          </p>
        )}
      </div>

      {/* Historical Polls Archive */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>POLL HISTORY ARCHIVE</span>
        </h3>

        <div className="space-y-3">
          {pollHistory.length > 0 ? (
            pollHistory.map(p => (
              <div key={p.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="font-display font-bold text-sm text-white">{p.question}</h5>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(p.createdAt).toLocaleDateString()} // {p.totalVotes?.toLocaleString()} votes
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-slate-400">
                  {p.options?.map((opt: any) => (
                    <span key={opt.id} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                      {opt.text}: <strong className="text-white">{opt.votes}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs font-mono text-slate-500 py-4 italic text-center">
              No historical polls recorded.
            </p>
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="max-w-lg w-full bg-[#0b0e17] border border-white/20 rounded-2xl p-6 shadow-2xl space-y-4">
            <h4 className="font-display font-black text-xl text-white uppercase tracking-wider">
              CREATE NORMAL COMMUNITY POLL
            </h4>

            <form onSubmit={handleCreatePoll} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  POLL QUESTION
                </label>
                <input
                  type="text"
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. WHICH MISSION STRATEGY SHOULD WE LEAD WITH?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>OPTIONS (2 TO 5)</span>
                  {options.length < 5 && (
                    <button
                      type="button"
                      onClick={handleAddOptionField}
                      className="text-[#00f0ff] hover:underline text-[10px]"
                    >
                      + Add Option
                    </button>
                  )}
                </label>
                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <input
                      key={idx}
                      type="text"
                      required
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}...`}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  DURATION (MINUTES)
                </label>
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-[#00f0ff] hover:bg-[#33f3ff] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider"
                >
                  {createLoading ? 'Publishing...' : 'Launch Poll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
