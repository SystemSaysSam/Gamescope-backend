import React from 'react';
import { 
  Radio, 
  Sliders, 
  MessageSquare, 
  Gamepad2, 
  Bell, 
  BarChart3, 
  Mail, 
  ShieldAlert, 
  LogOut, 
  Activity, 
  Vote,
  FileText,
  Youtube,
  ExternalLink
} from 'lucide-react';

export type AdminTab = 
  | 'overview' 
  | 'event' 
  | 'inactive' 
  | 'chat' 
  | 'youtube'
  | 'polls' 
  | 'arcade' 
  | 'notifications' 
  | 'analytics' 
  | 'subscribers' 
  | 'audit';

interface AdminNavbarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  adminEmail: string;
  onLogout: () => void;
  streamState: string;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({
  activeTab,
  onSelectTab,
  adminEmail,
  onLogout,
  streamState
}) => {
  const navItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'event', label: 'Event Control', icon: <Sliders className="w-4 h-4" /> },
    { id: 'inactive', label: 'Inactive Screen', icon: <FileText className="w-4 h-4" /> },
    { id: 'chat', label: 'Chat & Moderation', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'youtube', label: 'YouTube Chat', icon: <Youtube className="w-4 h-4 text-red-500" /> },
    { id: 'polls', label: 'Live Polls', icon: <Vote className="w-4 h-4" /> },
    { id: 'arcade', label: 'Arcade Management', icon: <Gamepad2 className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'analytics', label: 'Audience & Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'subscribers', label: 'Subscribers', icon: <Mail className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Logs', icon: <ShieldAlert className="w-4 h-4" /> }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#0b0e17]/95 border-b border-white/10 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Header Row */}
        <div className="h-16 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#ff2a85]/20 border border-[#ff2a85] flex items-center justify-center shadow-[0_0_15px_rgba(255,42,133,0.3)]">
              <Radio className="w-5 h-5 text-[#ff2a85] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-display font-black text-xl text-white tracking-wider">GAME</span>
                <span className="font-display font-black text-xl text-[#00f0ff] tracking-wider">SCOPE</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ff2a85]/20 text-[#ff2a85] border border-[#ff2a85]/40 font-bold">
                  COMMAND CENTER
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">OPERATIONAL LIVESTREAM CONTROL & MODERATION</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* View Live Stream Site Button */}
            <a
              href="http://localhost:5174/gtavi"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30 text-xs font-mono transition-colors"
              title="Open public livestream frontend at /gtavi"
            >
              <span>VIEW /GTAVI</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            {/* Live State Badge */}
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-xs font-mono">
              <span className="text-slate-400">STREAM STATE:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                streamState === 'LIVE' ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40' :
                streamState === 'BREAK' ? 'bg-[#ffaa00]/20 text-[#ffaa00] border border-[#ffaa00]/40' :
                streamState === 'STARTING' ? 'bg-[#ff2a85]/20 text-[#ff2a85] border border-[#ff2a85]/40' :
                streamState === 'ENDED' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/40'
              }`}>
                {streamState}
              </span>
            </div>

            {/* Admin identity & Logout */}
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="hidden md:inline text-slate-300">{adminEmail}</span>
              <button
                onClick={onLogout}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors"
                title="Log out of admin session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation Row */}
        <nav className="flex space-x-1 overflow-x-auto py-2.5 scrollbar-none">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/40 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

      </div>
    </header>
  );
};
