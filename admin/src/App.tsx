import React, { useState, useEffect } from 'react';
import { AdminNavbar, AdminTab } from './components/AdminNavbar';
import { LoginModal } from './components/LoginModal';
import { OverviewTab } from './components/tabs/OverviewTab';
import { EventControlTab } from './components/tabs/EventControlTab';
import { InactiveScreenTab } from './components/tabs/InactiveScreenTab';
import { ChatModerationTab } from './components/tabs/ChatModerationTab';
import { YouTubeChatTab } from './components/tabs/YouTubeChatTab';
import { PollsTab } from './components/tabs/PollsTab';
import { ArcadeTab } from './components/tabs/ArcadeTab';
import { NotificationsTab } from './components/tabs/NotificationsTab';
import { AnalyticsTab } from './components/tabs/AnalyticsTab';
import { EmailSubscribersTab } from './components/tabs/EmailSubscribersTab';
import { AuditLogsTab } from './components/tabs/AuditLogsTab';
import { adminApi } from './services/adminApi';
import { adminSocket } from './services/adminSocket';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Authoritative State
  const [config, setConfig] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check existing session
  useEffect(() => {
    const token = adminApi.getToken();
    if (token) {
      adminApi.getMe()
        .then(res => {
          setIsAuthenticated(true);
          setAdminEmail(res.admin?.email || 'admin@gamescope.live');
        })
        .catch(() => {
          setIsAuthenticated(false);
          adminApi.logout();
        });
    }

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      adminSocket.disconnect();
    };

    window.addEventListener('gamescope-admin-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('gamescope-admin-unauthorized', handleUnauthorized);
  }, []);

  const loadOperationalData = async () => {
    setIsRefreshing(true);
    try {
      const [pubRes, anaRes, logsRes] = await Promise.all([
        adminApi.getPublicConfig(),
        adminApi.getAnalytics().catch(() => null),
        adminApi.getAuditLogs().catch(() => ({ logs: [] }))
      ]);

      setConfig(pubRes.config);
      if (anaRes) setAnalytics(anaRes);
      if (logsRes?.logs) setRecentLogs(logsRes.logs);
    } catch (err) {
      console.error('Failed to load operational data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadOperationalData();
      adminSocket.connect();

      const unsubState = adminSocket.on('event:state_updated', ({ state, version }) => {
        setConfig((prev: any) => ({ ...prev, state, version }));
      });

      const unsubCountdown = adminSocket.on('event:countdown_updated', ({ countdown, version }) => {
        setConfig((prev: any) => ({ ...prev, countdown, version }));
      });

      const unsubStream = adminSocket.on('event:stream_updated', ({ youtubeVideoId, youtubeStreamUrl, version }) => {
        setConfig((prev: any) => ({ ...prev, youtubeVideoId, youtubeStreamUrl, version }));
      });

      const unsubInactive = adminSocket.on('event:inactive_updated', ({ inactiveScreen, version }) => {
        setConfig((prev: any) => ({ ...prev, inactiveScreen, version }));
      });

      const unsubSync = adminSocket.on('event:force_sync', (newCfg) => {
        setConfig(newCfg);
      });

      return () => {
        unsubState();
        unsubCountdown();
        unsubStream();
        unsubInactive();
        unsubSync();
      };
    }
  }, [isAuthenticated]);

  const handleLoginSuccess = (email: string) => {
    setIsAuthenticated(true);
    setAdminEmail(email);
  };

  const handleLogout = () => {
    adminApi.logout();
    setIsAuthenticated(false);
    adminSocket.disconnect();
  };

  if (!isAuthenticated) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-[#ff2a85] selection:text-white">
      
      {/* Admin Operations Top Navbar */}
      <AdminNavbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        adminEmail={adminEmail}
        onLogout={handleLogout}
        streamState={config?.state || 'UPCOMING'}
      />

      {/* Main Tab Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewTab
            config={config}
            analytics={analytics}
            recentLogs={recentLogs}
            onNavigateTab={setActiveTab}
            onRefresh={loadOperationalData}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === 'event' && (
          <EventControlTab
            config={config}
            onConfigUpdated={setConfig}
          />
        )}

        {activeTab === 'inactive' && (
          <InactiveScreenTab
            config={config}
            onConfigUpdated={setConfig}
          />
        )}

        {activeTab === 'chat' && (
          <ChatModerationTab
            adminEmail={adminEmail}
          />
        )}

        {activeTab === 'youtube' && (
          <YouTubeChatTab />
        )}

        {activeTab === 'polls' && (
          <PollsTab />
        )}

        {activeTab === 'arcade' && (
          <ArcadeTab />
        )}

        {activeTab === 'notifications' && (
          <NotificationsTab />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            analytics={analytics}
            onRefresh={loadOperationalData}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === 'subscribers' && (
          <EmailSubscribersTab />
        )}

        {activeTab === 'audit' && (
          <AuditLogsTab />
        )}
      </main>

      {/* Admin Footer */}
      <footer className="w-full bg-[#05070a] border-t border-white/5 py-4 text-center text-[10px] font-mono text-slate-500">
        GameScope Live Command Center // Version 1.0.0 Production // Connected to Node.js Backend & Realtime Gateway
      </footer>

    </div>
  );
};
