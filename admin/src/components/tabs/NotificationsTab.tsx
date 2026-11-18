import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Send, 
  Check, 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Play, 
  ExternalLink 
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { adminSocket } from '../../services/adminSocket';

export const NotificationsTab: React.FC = () => {
  const [stats, setStats] = useState<any | null>(null);
  const [reminderData, setReminderData] = useState<{
    schedule: any;
    history: any[];
    eventConfig: any;
  } | null>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);

  // Custom Broadcast Form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [type, setType] = useState<'info' | 'important' | 'warning'>('info');
  const [sendInSite, setSendInSite] = useState(true);
  const [sendWebPush, setSendWebPush] = useState(false);
  const [sending, setSending] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);
  const [lastBroadcastResult, setLastBroadcastResult] = useState<any | null>(null);

  // Manual Trigger & Test State
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [triggeringManual, setTriggeringManual] = useState(false);

  const fetchData = async () => {
    try {
      const [s, r, b] = await Promise.all([
        adminApi.getNotificationStats(),
        adminApi.getReminderDetails(),
        adminApi.getBroadcastHistory()
      ]);
      setStats(s);
      setReminderData(r);
      setBroadcastHistory(b.history || []);
    } catch (err: any) {
      console.error('[NotificationsTab] Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen for realtime reminder updates via Socket.IO
    const unsub = adminSocket.on('reminder:status_update', (data: any) => {
      console.log('[NotificationsTab] Realtime reminder status update:', data);
      if (data?.schedule) {
        setReminderData(prev => prev ? { ...prev, schedule: data.schedule } : null);
      }
      fetchData();
    });

    return () => {
      unsub();
    };
  }, []);

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendInSite && !sendWebPush) {
      alert('Please select at least one delivery mechanism (In-Site or Web Push).');
      return;
    }

    if (sendWebPush) {
      const activeCount = stats?.activeSubscriptions || 0;
      if (!confirm(`CONFIRMATION: You are about to send a desktop browser push notification to ${activeCount} active devices. Proceed?`)) {
        return;
      }
    }

    setSending(true);
    setBroadcastSuccess(false);

    try {
      const res = await adminApi.sendBroadcast({
        title: title.trim(),
        body: body.trim(),
        type,
        url: url.trim() || '/',
        sendInSite,
        sendWebPush
      });
      setBroadcastSuccess(true);
      setLastBroadcastResult(res.broadcast);
      setTitle('');
      setBody('');
      setBroadcastHistory(prev => [res.broadcast, ...prev]);
      fetchData();
      setTimeout(() => setBroadcastSuccess(false), 5000);
    } catch (err: any) {
      alert(`Broadcast failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleTestNotification = async () => {
    setTesting(true);
    try {
      const res = await adminApi.sendTestNotification();
      alert(`Test notification dispatched!\n- Eligible: ${res.stats?.totalEligible}\n- Accepted by push service: ${res.stats?.acceptedByPushService}\n- Failed: ${res.stats?.failed}\n- Expired endpoints: ${res.stats?.expiredSubscriptions}`);
      fetchData();
    } catch (err: any) {
      alert(`Test push failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSyncReminder = async () => {
    setSyncing(true);
    try {
      const res = await adminApi.syncReminder();
      setReminderData(prev => prev ? { ...prev, schedule: res.schedule } : null);
      alert(`Automated reminder synchronized with authoritative countdown: ${res.schedule.status}`);
      fetchData();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleTriggerReminderNow = async () => {
    if (!confirm('CONFIRMATION: Trigger the 15-Minute Event Reminder immediately? This will dispatch the Web Push reminder to all eligible subscriptions right now.')) {
      return;
    }
    setTriggeringManual(true);
    try {
      const res = await adminApi.triggerReminderNow();
      setReminderData(prev => prev ? { ...prev, schedule: res.schedule } : null);
      alert(`Reminder triggered!\nStatus: ${res.schedule.status}\nAccepted: ${res.schedule.deliveryStats?.acceptedByPushService}\nFailed: ${res.schedule.deliveryStats?.failed}`);
      fetchData();
    } catch (err: any) {
      alert(`Trigger failed: ${err.message}`);
    } finally {
      setTriggeringManual(false);
    }
  };

  const schedule = reminderData?.schedule;
  const eventConfig = reminderData?.eventConfig;

  // Render Status Badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#00ff88]/15 border border-[#00ff88]/40 text-[#00ff88] flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            <span>SCHEDULED</span>
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#ffaa00]/15 border border-[#ffaa00]/40 text-[#ffaa00] flex items-center space-x-1.5">
            <RefreshCw className="w-3 h-3 animate-spin text-[#ffaa00]" />
            <span>PROCESSING DELIVERY</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#00f0ff]/15 border border-[#00f0ff]/40 text-[#00f0ff] flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>COMPLETED</span>
          </span>
        );
      case 'TRIGGER_EXECUTED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/15 border border-blue-500/40 text-blue-400 flex items-center space-x-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>TRIGGER EXECUTED</span>
          </span>
        );
      case 'PARTIALLY_DELIVERED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
            <span>PARTIALLY DELIVERED</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-red-500/15 border border-red-500/40 text-red-400 flex items-center space-x-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            <span>FAILED</span>
          </span>
        );
      case 'MISSED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/15 border border-orange-500/40 text-orange-400 flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <span>MISSED (WINDOW LAPSED)</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-500/15 border border-slate-500/40 text-slate-400">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/5 border border-white/10 text-slate-400">
            {status || 'NOT SCHEDULED'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      
      {/* 1. Subscription Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE WEB PUSH DEVICES</span>
            <Bell className="w-4 h-4 text-[#00f0ff]" />
          </div>
          <div className="text-3xl font-display font-bold text-white">
            {stats?.activeSubscriptions?.toLocaleString() || 0}
          </div>
          <p className="text-[11px] font-mono text-slate-400">
            Total registered endpoints: <strong className="text-slate-200">{stats?.totalSubscriptions || 0}</strong> ({stats?.expiredSubscriptions || 0} expired)
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>EVENT START TIME & TIMEZONE</span>
            <Clock className="w-4 h-4 text-[#F276B9]" />
          </div>
          <div className="text-lg font-display font-bold text-white truncate">
            {eventConfig?.countdown?.label || 'EVENT TIME: 4:30 PM IST'}
          </div>
          <p className="text-[11px] font-mono text-slate-400">
            Target: {schedule?.eventStartTimeIso ? new Date(schedule.eventStartTimeIso).toLocaleString() : 'Not Set'} ({schedule?.timezone || 'Asia/Kolkata'})
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/10 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
              <span>TEST WEB PUSH DELIVERY</span>
              <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
            </div>
            <p className="text-[11px] text-slate-300">
              Dispatches a test notification to all active devices to verify VAPID delivery and report acceptance vs failure.
            </p>
          </div>
          <button
            onClick={handleTestNotification}
            disabled={testing}
            className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-mono text-xs font-bold transition-all disabled:opacity-50"
          >
            {testing ? 'Dispatching Test...' : 'Send Test Notification'}
          </button>
        </div>

      </div>

      {/* 2. AUTOMATIC 15-MINUTE EVENT REMINDER REAL MONITORING SECTION */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-[#00f0ff]/20 shadow-[0_0_30px_rgba(0,240,255,0.05)] space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <Clock className="w-5 h-5 text-[#00f0ff]" />
              <h3 className="font-display font-black text-xl text-white tracking-wider">
                AUTOMATED 15-MINUTE EVENT REMINDER MONITOR
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Autonomous server-side scheduler. Operates independently without manual admin intervention.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {renderStatusBadge(schedule?.status || 'NOT_SCHEDULED')}
            <button
              onClick={handleSyncReminder}
              disabled={syncing}
              title="Synchronize reminder with current event countdown"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleTriggerReminderNow}
              disabled={triggeringManual}
              title="Simulate or force immediate reminder execution"
              className="px-3 py-1.5 rounded-lg bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/30 text-[#00f0ff] font-mono text-xs font-bold transition-all disabled:opacity-50 flex items-center space-x-1.5"
            >
              <Play className="w-3 h-3" />
              <span>{triggeringManual ? 'Triggering...' : 'Simulate / Trigger Now'}</span>
            </button>
          </div>
        </div>

        {/* Real Schedule & Execution Measurements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              SCHEDULED REMINDER TRIGGER
            </span>
            <div className="text-sm font-mono font-bold text-white">
              {schedule?.scheduledReminderTimeIso ? new Date(schedule.scheduledReminderTimeIso).toLocaleTimeString() : 'N/A'}
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              {schedule?.scheduledReminderTimeIso ? new Date(schedule.scheduledReminderTimeIso).toLocaleDateString() : ''} (15m before event)
            </span>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              AUTOMATED TRIGGER EXECUTED
            </span>
            <div className="text-sm font-mono font-bold">
              {schedule?.triggerExecuted ? (
                <span className="text-[#00ff88] flex items-center space-x-1">
                  <Check className="w-4 h-4" />
                  <span>YES ({new Date(schedule.triggerExecutedAt || schedule.updatedAt).toLocaleTimeString()})</span>
                </span>
              ) : schedule?.status === 'MISSED' ? (
                <span className="text-orange-400">MISSED</span>
              ) : schedule?.status === 'CANCELLED' ? (
                <span className="text-slate-500">CANCELLED</span>
              ) : (
                <span className="text-[#00f0ff]">ARMED / PENDING</span>
              )}
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              Config Version: v{schedule?.configVersion || 1}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              DELIVERY ATTEMPTS
            </span>
            <div className="text-sm font-mono font-bold text-white">
              {schedule?.deliveryStats?.attempts ?? (schedule?.triggerExecuted ? 0 : 'Pending Trigger')}
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              Eligible subscribers: {schedule?.deliveryStats?.totalEligible ?? stats?.activeSubscriptions ?? 0}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              ACCEPTED BY PUSH SERVICES
            </span>
            <div className="text-sm font-mono font-bold text-[#00ff88]">
              {schedule?.deliveryStats?.acceptedByPushService ?? (schedule?.triggerExecuted ? 0 : 'Pending')}
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              Failed: <span className="text-red-400">{schedule?.deliveryStats?.failed ?? 0}</span> ({schedule?.deliveryStats?.expiredSubscriptions ?? 0} expired)
            </span>
          </div>

        </div>

        {/* Execution Error or Recovery Policy Details */}
        {(schedule?.lastError || schedule?.recoveryAction) && (
          <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-start space-x-3 text-xs font-mono text-orange-200">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {schedule.lastError && (
                <div>
                  <strong className="text-orange-400">Scheduler Log:</strong> {schedule.lastError}
                </div>
              )}
              {schedule.recoveryAction && (
                <div>
                  <strong className="text-orange-400">Recovery Action:</strong> {schedule.recoveryAction}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Historical Reminder Runs Table */}
        {reminderData?.history && reminderData.history.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            <span className="text-xs font-mono text-slate-400 block font-bold">
              HISTORICAL REMINDER EXECUTIONS
            </span>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-2 pr-4">VERSION</th>
                    <th className="py-2 pr-4">SCHEDULED TIME</th>
                    <th className="py-2 pr-4">STATUS</th>
                    <th className="py-2 pr-4">ATTEMPTED</th>
                    <th className="py-2 pr-4">ACCEPTED</th>
                    <th className="py-2 pr-4">FAILED</th>
                    <th className="py-2">EXECUTED AT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {reminderData.history.map(item => (
                    <tr key={item.id} className="hover:bg-white/5">
                      <td className="py-2 pr-4 text-white font-bold">v{item.configVersion}</td>
                      <td className="py-2 pr-4">{item.scheduledReminderTimeIso ? new Date(item.scheduledReminderTimeIso).toLocaleTimeString() : 'N/A'}</td>
                      <td className="py-2 pr-4">{renderStatusBadge(item.status)}</td>
                      <td className="py-2 pr-4">{item.deliveryStats?.attempts ?? 0}</td>
                      <td className="py-2 pr-4 text-[#00ff88] font-bold">{item.deliveryStats?.acceptedByPushService ?? 0}</td>
                      <td className="py-2 pr-4 text-red-400">{item.deliveryStats?.failed ?? 0}</td>
                      <td className="py-2">{item.triggerExecutedAt ? new Date(item.triggerExecutedAt).toLocaleString() : 'Not Executed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* 3. Custom Broadcast Dispatcher & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Broadcast Form */}
        <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="font-display font-black text-xl text-white tracking-wider flex items-center space-x-2">
              <Send className="w-5 h-5 text-[#00f0ff]" />
              <span>ADMINISTRATOR PUSH BROADCAST</span>
            </h3>
            {broadcastSuccess && (
              <span className="flex items-center space-x-1 text-xs font-mono text-[#00ff88]">
                <Check className="w-3.5 h-3.5" />
                <span>DISPATCHED!</span>
              </span>
            )}
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                NOTIFICATION TITLE
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. BROADCAST UPDATE: Exclusive Gameplay Segment"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                NOTIFICATION BODY
              </label>
              <textarea
                required
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter alert details..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-sans text-xs focus:outline-none focus:border-[#00f0ff]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  DESTINATION URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="/"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  ALERT TYPE
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff]"
                >
                  <option value="info">Info (Cyan)</option>
                  <option value="important">Important (Pink)</option>
                  <option value="warning">Warning (Amber)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                DELIVERY MECHANISMS
              </label>
              <div className="space-y-1.5 pt-1 text-xs font-mono">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendInSite}
                    onChange={(e) => setSendInSite(e.target.checked)}
                    className="rounded accent-[#00f0ff]"
                  />
                  <span>In-Site Toast Banner (All Connected Website Visitors)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendWebPush}
                    onChange={(e) => setSendWebPush(e.target.checked)}
                    className="rounded accent-[#ff2a85]"
                  />
                  <span className="text-[#ff2a85]">
                    Desktop Browser Push (All {stats?.activeSubscriptions || 0} Subscribed Devices)
                  </span>
                </label>
              </div>
            </div>

            {lastBroadcastResult && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300 space-y-1">
                <span className="text-white font-bold block">LAST DELIVERY EXECUTION STATS:</span>
                <div>In-Site Recipients: <strong className="text-white">{lastBroadcastResult.deliveryStats?.inSiteRecipients || 0}</strong></div>
                <div>Web Push Attempted: <strong className="text-white">{lastBroadcastResult.deliveryStats?.pushAttempted || 0}</strong></div>
                <div>Push Service Accepted: <strong className="text-[#00ff88]">{lastBroadcastResult.deliveryStats?.pushSuccessful || 0}</strong></div>
                <div>Push Failed: <strong className="text-red-400">{lastBroadcastResult.deliveryStats?.pushFailed || 0}</strong></div>
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#00ff88] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {sending ? 'DISPATCHING BROADCAST...' : 'SEND BROADCAST TO ALL ELIGIBLE SUBSCRIBERS'}
            </button>
          </form>
        </div>

        {/* Live Visual Preview of In-App Toast */}
        <div className="space-y-4">
          <span className="text-xs font-mono text-slate-400 block">
            VISUAL IN-APP FLOATING TOAST PREVIEW
          </span>

          <div className="p-4 rounded-xl bg-[#0b0e17]/95 border border-[#00f0ff]/50 shadow-[0_0_30px_rgba(0,240,255,0.25)] flex items-start space-x-3 text-slate-100 max-w-sm">
            <div className="w-8 h-8 rounded-lg bg-[#00f0ff]/10 border border-[#00f0ff]/30 flex items-center justify-center shrink-0 mt-0.5">
              <Bell className="w-4 h-4 text-[#00f0ff]" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <div className="text-[10px] font-mono font-bold text-[#00f0ff] uppercase tracking-wider flex items-center space-x-1.5">
                <span>BROADCAST PUSH ALERT</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-ping" />
              </div>
              <h4 className="text-xs font-bold text-white font-display mt-0.5 leading-snug">
                {title || 'BROADCAST ALERT TITLE PREVIEW'}
              </h4>
              <p className="text-[11px] text-slate-300 font-sans mt-0.5 leading-tight">
                {body || 'This preview shows how your alert will render on the public website for connected visitors.'}
              </p>
              {url && url !== '/' && (
                <div className="mt-1 text-[10px] font-mono text-[#00f0ff] flex items-center space-x-1">
                  <span>Destination: {url}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono text-slate-400">
            <div className="flex items-center space-x-2 text-white font-bold">
              <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
              <span>DELIVERY SEPARATION & ACCURACY GUARANTEE</span>
            </div>
            <p className="leading-relaxed">
              <strong>Web Push Acceptance ≠ Device Display:</strong> Web Push delivery metrics explicitly measure responses accepted by upstream push services (FCM, Mozilla, Apple).
            </p>
            <p className="leading-relaxed">
              <strong>No Arbitrary Limits:</strong> Administrator broadcasts are dispatched to 100% of active, non-expired subscriptions via concurrent batches of 25.
            </p>
          </div>
        </div>

      </div>

      {/* 4. Broadcast History */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-white/10 space-y-4">
        <h3 className="font-display font-black text-lg text-white tracking-wider flex items-center space-x-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>BROADCAST DELIVERY HISTORY</span>
        </h3>

        <div className="space-y-3">
          {broadcastHistory.length > 0 ? (
            broadcastHistory.map(item => (
              <div key={item.id} className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">{item.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-white/10 text-[#00f0ff]">
                      {item.type}
                    </span>
                  </div>
                  <p className="text-slate-300 font-sans mt-1 text-xs">{item.body}</p>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Sent by {item.sentBy} at {new Date(item.sentAt).toLocaleString()}
                  </span>
                </div>

                <div className="text-right text-[11px] text-slate-400 whitespace-nowrap">
                  <div>In-Site: <strong className="text-white">{item.deliveryStats?.inSiteRecipients || 0}</strong></div>
                  <div>Web Push Attempted: <strong className="text-white">{item.deliveryStats?.pushAttempted || 0}</strong></div>
                  <div>Accepted: <strong className="text-[#00ff88]">{item.deliveryStats?.pushSuccessful || 0}</strong></div>
                  <div>Failed: <strong className="text-red-400">{item.deliveryStats?.pushFailed || 0}</strong></div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs font-mono text-slate-500 py-4 italic text-center">
              No custom broadcasts recorded.
            </p>
          )}
        </div>
      </div>

    </div>
  );
};
