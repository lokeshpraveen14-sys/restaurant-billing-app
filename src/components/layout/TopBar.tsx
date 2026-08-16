import React from 'react';
import { Bell, WifiHigh, WifiSlash, Sun, Moon, CornersOut, CornersIn } from '@phosphor-icons/react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';

interface TopBarProps {
  title: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, actions }: TopBarProps) {
  const { currentUser } = useAuthStore();
  const { setMobileSidebar, theme, toggleTheme } = useUIStore();
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

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

        {/* Online indicator */}
        <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600 }}>
          {isOnline
            ? <><WifiHigh size={16} color="var(--status-free)" /><span style={{ color: 'var(--status-free)' }}>Online</span></>
            : <><WifiSlash size={16} color="var(--status-reserved)" /><span style={{ color: 'var(--status-reserved)' }}>Offline</span></>
          }
        </div>

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
    <div style={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
      {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
    </div>
  );
}
