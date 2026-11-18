import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Search } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

export const AuditLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAuditLogs();
      setLogs(res.logs || []);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l => 
    !search || 
    l.action.toLowerCase().includes(search.toLowerCase()) || 
    l.adminEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d111a] border border-white/10">
        <div>
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-[#ff2a85]" />
            <span>IMMUTABLE ADMINISTRATIVE ACTION AUDIT LOGS</span>
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Every state mutation, stream change, moderation timeout, ban, poll creation, and score removal is permanently audited.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-mono text-slate-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action or admin email..."
          className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#ff2a85]"
        />
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
      </div>

      {/* Audit Log Table */}
      <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="py-2.5 px-3">TIMESTAMP</th>
              <th className="py-2.5 px-3">ADMINISTRATOR</th>
              <th className="py-2.5 px-3">ACTION PERFORMED</th>
              <th className="py-2.5 px-3">DETAILS / VALUES</th>
              <th className="py-2.5 px-3">IP ORIGIN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-[#00f0ff] font-bold">
                    {log.adminEmail}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-3 max-w-md truncate text-slate-300">
                    {log.previousValue !== undefined && (
                      <span className="text-red-400">prev: {JSON.stringify(log.previousValue)} </span>
                    )}
                    {log.newValue !== undefined && (
                      <span className="text-[#00ff88]">new: {JSON.stringify(log.newValue)}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    {log.ip || 'internal'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                  No audit logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
