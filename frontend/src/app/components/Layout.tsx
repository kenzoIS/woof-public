import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { WOOFChatbot } from "./WOOFChatbot";
import { NotificationCenter } from "./NotificationCenter";
import { ConnectionBanner } from "./ConnectionBanner";
import { RealtimeListener } from "./RealtimeListener";
import { Toaster } from "./ui/sonner";
import { ErrorModal } from "./ErrorModal";
import { touchDashboardSession } from "../lib/api";
import { endDashboardSession } from "../lib/sessionLifecycle";
import {
  applyDocumentDashboardPreferences,
  applyStoredTheme,
  getSettingsPreferences,
  onSettingsPreferencesChanged,
  saveSettingsPreferences,
} from "../lib/preferences";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const mainContentRef = useRef<HTMLElement>(null);
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(10);


  useEffect(() => {
    try {
      const preferences = getSettingsPreferences();
      setIsSidebarCollapsed(preferences.dashboard.sidebarCollapsedByDefault);
      setSessionTimeoutMinutes(preferences.security.sessionTimeoutMinutes);
      applyStoredTheme();
    } catch {
      // Ignore localStorage errors
    }

    return onSettingsPreferencesChanged((preferences) => {
      applyDocumentDashboardPreferences(preferences.dashboard);
      setIsSidebarCollapsed(preferences.dashboard.sidebarCollapsedByDefault);
      setSessionTimeoutMinutes(preferences.security.sessionTimeoutMinutes);
    });
  }, []);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        saveSettingsPreferences((current) => ({
          ...current,
          dashboard: {
            ...current.dashboard,
            sidebarCollapsedByDefault: next,
          },
        }));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  useEffect(() => {
    let ending = false;
    let lastHeartbeat = 0;
    const stored = Number(sessionStorage.getItem('woofLastActivity'));
    let lastActivity = stored > 0 ? stored : Date.now();
    const expire = () => {
      if (ending) return;
      ending = true;
      setShowSessionExpired(true);
      void endDashboardSession('session_timeout').catch(() => {}).finally(() => {
        window.location.replace('/login');
      });
    };
    const check = () => {
      if (Date.now() - lastActivity >= sessionTimeoutMinutes * 60000) expire();
    };
    const heartbeat = () => {
      if (Date.now() - lastHeartbeat < 15000 || ending) return;
      lastHeartbeat = Date.now();
      void touchDashboardSession(sessionTimeoutMinutes).catch(error => {
        if (/session|authentication|sign in/i.test(error.message)) expire();
      });
    };
    const activity = () => {
      check();
      if (ending) return;
      lastActivity = Date.now();
      sessionStorage.setItem('woofLastActivity', String(lastActivity));
      heartbeat();
    };
    check();
    if (!ending) heartbeat();
    const interval = setInterval(check, 1000);
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, activity, true));
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(interval);
      events.forEach(event => document.removeEventListener(event, activity, true));
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [sessionTimeoutMinutes]);

  // Layout remains mounted while Next.js swaps dashboard pages, so reset its
  // scroll container explicitly instead of carrying a previous page's position.
  useEffect(() => {
    mainContentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [router.asPath]);

  const handleSessionExpiredAction = () => { window.location.replace('/login'); };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Connection Status Banner */}
      <ConnectionBanner />

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar - Dynamic width on desktop, overlay on mobile */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        transform transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar - Fixed 64px */}
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Page Content - Scrollable & Responsive to Sidebar State */}
        <main ref={mainContentRef} className="woof-main flex-1 overflow-y-auto bg-[#FFF2FA]">
          <div className={`w-full mx-auto py-4 md:py-6 lg:py-8 transition-all duration-300 ease-in-out ${
            isSidebarCollapsed
              ? "max-w-none px-4 sm:px-6 md:px-8 lg:px-10"
              : "max-w-[1440px] px-4 md:px-6 lg:px-8"
          }`}>
            {children}
          </div>
        </main>
      </div>

      {/* Global Components */}
      <RealtimeListener />
      <WOOFChatbot />
      <NotificationCenter />
      <Toaster />

      {/* Session Expired Modal */}
      <ErrorModal
        isOpen={showSessionExpired}
        onClose={() => {}}
        errorType="session_expired"
        onRetry={handleSessionExpiredAction}
      />
    </div>
  );
}
