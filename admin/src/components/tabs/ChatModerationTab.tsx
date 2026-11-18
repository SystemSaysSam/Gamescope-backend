import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Trash2, 
  Pin, 
  Clock, 
  Ban, 
  Search, 
  ShieldAlert, 
  Send,
  RefreshCw
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { adminSocket } from '../../services/adminSocket';

interface ChatModerationTabProps {
  adminEmail: string;
}

export const ChatModerationTab: React.FC<ChatModerationTabProps> = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [customAnnouncement, setCustomAnnouncement] = useState('');
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  // Timeout Modal
  const [timeoutModalUser, setTimeoutModalUser] = useState<{ id: string; username: string } | null>(null);
  const [timeoutDuration, setTimeoutDuration] = useState('60');

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getMessages(100);
      setMessages(res.messages || []);
      const rest = await adminApi.getRestrictions();
      setRestrictions(rest.restrictions || []);
    } catch (err: any) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Listen to realtime messages via adminSocket
    const unsubMsg = adminSocket.on('chat:message', (newMsg) => {
      setMessages(prev => [newMsg, ...prev]);
    });

    const unsubDel = adminSocket.on('chat:message_deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    });

    return () => {
      unsubMsg();
      unsubDel();
    };
  }, []);

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await adminApi.deleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (err: any) {
      alert(`Failed to delete message: ${err.message}`);
    }
  };

  const handlePinMessage = async (msgId: string) => {
    try {
      await adminApi.pinMessage(msgId);
      alert('Message pinned to all connected chat viewports!');
    } catch (err: any) {
      alert(`Pin failed: ${err.message}`);
    }
  };

  const handleUnpinAll = async () => {
    try {
      await adminApi.unpinMessage();
      alert('Active pinned message unpinned.');
    } catch (err: any) {
      alert(`Unpin failed: ${err.message}`);
    }
  };

  const handleSendCustomPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAnnouncement.trim()) return;
    setAnnouncementLoading(true);

    try {
      await adminApi.customPin({
        username: 'GAMESCOPE ADMIN',
        text: customAnnouncement.trim(),
        avatarColor: '#ffaa00'
      });
      setCustomAnnouncement('');
      alert('Official Announcement Pinned to Community Chat!');
    } catch (err: any) {
      alert(`Announcement failed: ${err.message}`);
    } finally {
      setAnnouncementLoading(false);
    }
  };

  const handleApplyTimeout = async () => {
    if (!timeoutModalUser) return;
    try {
      await adminApi.timeoutUser(timeoutModalUser.id, parseInt(timeoutDuration, 10));
      setTimeoutModalUser(null);
      const rest = await adminApi.getRestrictions();
      setRestrictions(rest.restrictions || []);
      alert(`Timeout applied to ${timeoutModalUser.username}.`);
    } catch (err: any) {
      alert(`Timeout failed: ${err.message}`);
    }
  };

  const handleBanUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to block ${username} from this stream's chat?`)) return;
    try {
      await adminApi.banUser(userId, 'Administrative stream chat ban.');
      const rest = await adminApi.getRestrictions();
      setRestrictions(rest.restrictions || []);
      alert(`User ${username} blocked from stream chat.`);
    } catch (err: any) {
      alert(`Ban failed: ${err.message}`);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      await adminApi.unbanUser(userId);
      const rest = await adminApi.getRestrictions();
      setRestrictions(rest.restrictions || []);
    } catch (err: any) {
      alert(`Unban failed: ${err.message}`);
    }
  };

  const filteredMessages = messages.filter(m => 
    !searchTerm || 
    m.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Top Action Bar: Search, Custom Pin, Unpin */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Custom Admin Announcement Creator */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <Pin className="w-4 h-4 text-[#ffaa00]" />
              <span>PUBLISH OFFICIAL ADMINISTRATIVE ANNOUNCEMENT</span>
            </h3>
            <button
              onClick={handleUnpinAll}
              className="text-xs font-mono text-red-400 hover:text-red-300 hover:underline"
            >
              Clear Current Pin
            </button>
          </div>

          <form onSubmit={handleSendCustomPin} className="flex gap-2">
            <input
              type="text"
              required
              value={customAnnouncement}
              onChange={(e) => setCustomAnnouncement(e.target.value)}
              placeholder="e.g. WELCOME OPERATIVES: Developer Q&A starts at 18:30..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#ffaa00]"
            />
            <button
              type="submit"
              disabled={announcementLoading}
              className="px-4 py-2 rounded-xl bg-[#ffaa00] hover:bg-[#ffc033] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-1"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{announcementLoading ? 'PINNING...' : 'PIN NOW'}</span>
            </button>
          </form>
        </div>

        {/* Search & Refresh */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-white">SEARCH CHAT</span>
            <button
              onClick={fetchMessages}
              disabled={loading}
              className="text-xs font-mono text-[#00f0ff] hover:underline flex items-center space-x-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search user or message content..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          </div>
        </div>

      </div>

      {/* Main Section: Realtime Messages & Active Restrictions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Messages Feed (2 Columns) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-mono font-bold text-white flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-[#00f0ff]" />
              <span>LIVE CHAT MESSAGES ({filteredMessages.length})</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">Independent GameScope Community Chat</span>
          </div>

          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {filteredMessages.length > 0 ? (
              filteredMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className="p-3 rounded-xl bg-black/40 border border-white/5 hover:border-white/15 transition-all flex items-start justify-between gap-3 text-xs font-mono"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-bold text-white" style={{ color: msg.avatarColor || '#00f0ff' }}>
                        {msg.username}
                      </span>
                      {msg.badge && (
                        <span className="text-[8px] px-1 py-0.2 rounded bg-white/10 text-slate-300 font-bold">
                          {msg.badge}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                      <span className="text-[10px] text-slate-500">Likes: {msg.likes || 0}</span>
                    </div>
                    <p className="text-slate-200 font-sans text-xs break-words">
                      {msg.text}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handlePinMessage(msg.id)}
                      title="Pin as highlighted comment"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-[#ffaa00]/20 text-slate-400 hover:text-[#ffaa00] transition-colors"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setTimeoutModalUser({ id: msg.userId, username: msg.username })}
                      title="Apply temporary timeout"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-yellow-500/20 text-slate-400 hover:text-yellow-400 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleBanUser(msg.userId, msg.username)}
                      title="Block user from stream chat"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      title="Delete message"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs font-mono text-slate-500 py-8 text-center italic">
                No chat messages match your search filter.
              </p>
            )}
          </div>
        </div>

        {/* Active Restrictions Column (1 Column) */}
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <div className="border-b border-white/5 pb-2">
            <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>ACTIVE USER RESTRICTIONS</span>
            </h3>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
              Escalating timeouts & stream-level blocks
            </p>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {restrictions.length > 0 ? (
              restrictions.map(r => (
                <div key={r.userId} className="p-3 rounded-xl bg-black/40 border border-red-500/20 space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold">{r.userId}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      r.type === 'ban' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {r.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">{r.reason}</p>
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleUnbanUser(r.userId)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Remove Restriction
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs font-mono text-slate-500 py-6 text-center italic">
                No active timeouts or bans.
              </p>
            )}
          </div>
        </div>

      </div>

      {/* TIMEOUT MODAL */}
      {timeoutModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="max-w-sm w-full bg-[#0b0e17] border border-white/20 rounded-2xl p-6 shadow-2xl space-y-4">
            <h4 className="font-display font-black text-xl text-white uppercase tracking-wider">
              APPLY USER TIMEOUT
            </h4>
            <p className="text-xs text-slate-300 font-mono">
              User: <strong className="text-[#00f0ff]">{timeoutModalUser.username}</strong>
            </p>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5">
                TIMEOUT DURATION
              </label>
              <select
                value={timeoutDuration}
                onChange={(e) => setTimeoutDuration(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
              >
                <option value="10">10 Seconds (Initial Warning)</option>
                <option value="60">1 Minute (Second Violation)</option>
                <option value="300">5 Minutes (Third Violation)</option>
                <option value="900">15 Minutes (Extended Cooldown)</option>
                <option value="3600">1 Hour (Severe Violation)</option>
              </select>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => setTimeoutModalUser(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyTimeout}
                className="px-4 py-2 rounded-xl bg-[#ffaa00] hover:bg-[#ffc033] text-slate-950 font-mono text-xs font-bold uppercase tracking-wider"
              >
                Apply Timeout
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
