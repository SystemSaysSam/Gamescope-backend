import React, { useState, useEffect } from 'react';
import { Mail, Download, Trash2, Search, RefreshCw } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

export const EmailSubscribersTab: React.FC = () => {
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEmailSubscribers(search);
      setSubscribers(res.subscribers || []);
    } catch (err: any) {
      console.error('Error fetching subscribers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscribers();
  }, [search]);

  const handleExportCsv = () => {
    window.open('/api/admin/subscriptions/email/export', '_blank');
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Are you sure you want to remove this subscriber?')) return;
    try {
      await adminApi.removeEmailSubscriber(id);
      setSubscribers(prev => prev.filter(s => s.id !== id));
      alert('Subscriber removed.');
    } catch (err: any) {
      alert(`Remove failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d111a] border border-white/10">
        <div>
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider flex items-center space-x-2">
            <Mail className="w-5 h-5 text-[#00f0ff]" />
            <span>EMAIL SUBSCRIBERS FOR GAMESCOPE UPDATES</span>
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Collected exclusively via the compact footer section. Separate from browser push reminders.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchSubscribers}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#00f0ff] hover:bg-[#33f3ff] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider shadow-lg"
          >
            <Download className="w-4 h-4" />
            <span>EXPORT CSV</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by subscriber name or email..."
          className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
        />
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
      </div>

      {/* Subscribers Table */}
      <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="py-2.5 px-3">NAME</th>
              <th className="py-2.5 px-3">EMAIL ADDRESS</th>
              <th className="py-2.5 px-3">SOURCE</th>
              <th className="py-2.5 px-3">SUBSCRIBED DATE</th>
              <th className="py-2.5 px-3">STATUS</th>
              <th className="py-2.5 px-3 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {subscribers.length > 0 ? (
              subscribers.map((s) => (
                <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3 text-white font-bold">{s.name}</td>
                  <td className="py-3 px-3 text-[#00f0ff]">{s.email}</td>
                  <td className="py-3 px-3 text-slate-400">{s.source || 'footer'}</td>
                  <td className="py-3 px-3 text-slate-400">
                    {s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString() : 'Recent'}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.active ? 'bg-[#00ff88]/20 text-[#00ff88]' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {s.active ? 'ACTIVE' : 'UNSUBSCRIBED'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => handleRemove(s.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                  No subscribers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
