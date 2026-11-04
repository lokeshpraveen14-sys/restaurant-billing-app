import React from 'react';
import { Bell, WifiHigh, WifiSlash, Sun, Moon, CornersOut, CornersIn, ArrowsClockwise } from '@phosphor-icons/react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore, useToast } from '../../store/uiStore';
import { useBillStore } from '../../store/billStore';
import { APP_VERSION, BUILD_TIMESTAMP } from '../../version';

interface TopBarProps {
  title: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, actions }: TopBarProps) {
  const { currentUser } = useAuthStore();
  const { setMobileSidebar, theme, toggleTheme } = useUIStore();
  const toast = useToast();
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const pendingSyncBillIds = useBillStore((s) => s.pendingSyncBillIds || []);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    toast.info('Syncing Bills', `Uploading ${pendingSyncBillIds.length} offline bills to cloud...`);
    try {
      const res = await useBillStore.getState().syncPendingBills();
      if (res.syncedCount > 0) {
        toast.success('Sync Complete', `Successfully uploaded ${res.syncedCount} bills to cloud!`);
      } else if (res.remainingCount === 0) {
        toast.success('All Synced', 'All bills are synced with the cloud.');
      } else {
        toast.warning('Sync Incomplete', `${res.remainingCount} bill(s) remaining. Will retry automatically.`);
      }
    } catch {
      toast.error('Sync Error', 'Network error while uploading bills. Will retry.');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const elem = document.documentElement as any;
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      setIsFullscreen(false);
    }
  };

  React.useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  return (
    <header className="topbar no-print">
      {/* Mobile hamburger */}
      <button
        className="topbar-hamburger"
        onClick={() => setMobileSidebar(true)}
        id="mobile-menu-btn"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div>
        <h1 className="topbar-title">{title}</h1>
      </div>

      <div className="topbar-actions">
        {actions}

        {/* Theme Toggle */}
        <button className="btn btn-ghost btn-icon hide-on-mobile" onClick={toggleTheme} title="Toggle Theme">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Fullscreen Toggle */}
        <button className="btn btn-ghost btn-icon hide-on-mobile" onClick={toggleFullscreen} title="Toggle Fullscreen">
          {isFullscreen ? <CornersIn size={20} /> : <CornersOut size={20} />}
        </button>

        {/* Offline Bills Sync Indicator */}
        {pendingSyncBillIds.length > 0 && (
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            title={`${pendingSyncBillIds.length} offline bill(s) pending sync. Click to upload now.`}
            className="btn btn-ghost btn-sm"
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid #f59e0b',
              color: '#f59e0b',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              opacity: isSyncing ? 0.7 : 1,
            }}
          >
            <ArrowsClockwise size={13} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : `${pendingSyncBillIds.length} offline bill${pendingSyncBillIds.length > 1 ? 's' : ''}`}
          </button>
        )}

        {/* Online indicator */}
        <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600 }}>
          {isOnline
            ? <><WifiHigh size={16} color="var(--status-free)" /><span style={{ color: 'var(--status-free)' }}>Online</span></>
            : <><WifiSlash size={16} color="var(--status-reserved)" /><span style={{ color: 'var(--status-reserved)' }}>Offline</span></>
          }
        </div>

        {/* Version Code Badge to verify deploy lane */}
        <span 
          className="hide-on-mobile"
          title={`Build: ${BUILD_TIMESTAMP}`}
          style={{
            fontSize: '0.68rem',
            padding: '2px 8px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--primary, #6366f1)',
            fontWeight: 800,
            letterSpacing: '0.5px'
          }}
        >
          {APP_VERSION}
        </span>

        {/* Time */}
        <div className="hide-on-mobile">
          <LiveClock />
        </div>
      </div>
    </header>
  );
}

function LiveClock() {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
      <span>{time.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <span>{time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
    </div>
  );
}
