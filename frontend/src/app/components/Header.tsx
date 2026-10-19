import { endDashboardSession } from "../lib/sessionLifecycle";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Bell, Calendar, Clock, Cloud, CloudRain, Sun, X, LogOut, User, Mail, Menu, Database } from "lucide-react";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { DataIngestion } from "./DataIngestion";
import {
  ChannelStatus,
  DataRange,
  getAlertThresholds,
  getChannelStatus,
  getCurrentWeather,
  getDataRange,

  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  recordOpportunityActed,
  UserNotification,
} from "../lib/api";
import {
  HISTORY_START_DATE,
  INGESTED_HISTORY_END_DATE,
  encodeCustomRange,
} from "../lib/dateRanges";
import {
  DEFAULT_SETTINGS_PREFERENCES,
  getSettingsPreferences,
  onSettingsPreferencesChanged,
} from "../lib/preferences";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const [dateRange, setDateRange] = useState("last-7-days");
  const [customStartDate, setCustomStartDate] = useState(HISTORY_START_DATE);
  const [customEndDate, setCustomEndDate] = useState(INGESTED_HISTORY_END_DATE);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const historyStartDate = dataRange?.historyStartDate || HISTORY_START_DATE;
  const historyEndDate = dataRange?.historyEndDate || INGESTED_HISTORY_END_DATE;

  useEffect(() => {
    const saved = localStorage.getItem("globalDateRange");
    if (saved) {
      setDateRange(saved);
      if (saved.startsWith("custom:")) {
        const [, start, end] = saved.split(":");
        setCustomStartDate(start || historyStartDate);
        setCustomEndDate(end || historyEndDate);
      }
      window.dispatchEvent(new CustomEvent("globalDateRangeChanged", { detail: saved }));
    }
  }, [historyEndDate, historyStartDate]);

  useEffect(() => {
    getDataRange()
      .then((range) => {
        setDataRange(range);
        if (!localStorage.getItem("globalDateRange")) {
          setCustomStartDate(range.historyStartDate || HISTORY_START_DATE);
          setCustomEndDate(range.historyEndDate || INGESTED_HISTORY_END_DATE);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getChannelStatus()
      .then(setChannelStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleDateRangeChange = (value: string) => {
    if (value === "custom") {
      setDateRange("custom");
      return;
    }
    setDateRange(value);
    localStorage.setItem("globalDateRange", value);
    window.dispatchEvent(new CustomEvent("globalDateRangeChanged", { detail: value }));
  };

  const applyCustomDateRange = () => {
    const encoded = encodeCustomRange(customStartDate, customEndDate, {
      min: historyStartDate,
      max: historyEndDate,
    });
    setDateRange(encoded);
    localStorage.setItem("globalDateRange", encoded);
    window.dispatchEvent(new CustomEvent("globalDateRangeChanged", { detail: encoded }));
  };

  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ingestionOpen, setIngestionOpen] = useState(false);
  const ingestionCloseTimer = useRef<number | null>(null);
  const [notifTab, setNotifTab] = useState<"all" | UserNotification["type"]>("all");
  const [currentWeather, setCurrentWeather] = useState<{
    tempCelsius: number;
    rainfallMm: number;
    isSynthetic: boolean;
    source?: string;
  } | null>(null);

  useEffect(() => {
    getCurrentWeather()
      .then(setCurrentWeather)
      .catch(() => {});
  }, []);

  const userEmail = typeof window !== "undefined" ? (sessionStorage.getItem("woofUserEmail") || "user@happytails.com") : "user@happytails.com";
  const userInitials = userEmail
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "WU";

  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_SETTINGS_PREFERENCES.notifications,
  );
  const [alertThresholds, setAlertThresholds] = useState(
    DEFAULT_SETTINGS_PREFERENCES.alertThresholds,
  );

  useEffect(() => {
    const preferences = getSettingsPreferences();
    setNotificationPreferences(preferences.notifications);
    setAlertThresholds(preferences.alertThresholds);
    getAlertThresholds()
      .then(setAlertThresholds)
      .catch(() => {});
    return onSettingsPreferencesChanged((preferences) => {
      setNotificationPreferences(preferences.notifications);
      setAlertThresholds(preferences.alertThresholds);
    });
  }, []);

  const fetchUserNotifications = () => {
    getUserNotifications(userEmail)
      .then((data) => {
        // An unavailable alerts API must not leave a stale notification badge
        // or drawer visible after the backend has stopped.
        setNotifications(Array.isArray(data) ? data : []);
      })
      .catch(() => setNotifications([]));
  };

  useEffect(() => {
    fetchUserNotifications();
    const interval = window.setInterval(fetchUserNotifications, 25_000);
    const handleRealtime = () => fetchUserNotifications();
    window.addEventListener("woof:realtime", handleRealtime);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("woof:realtime", handleRealtime);
    };
  }, [userEmail]);

  useEffect(() => {
    const handleDrawerOpen = () => openIngestionDrawer();
    window.addEventListener("openDataIngestionDrawer", handleDrawerOpen);
    return () => window.removeEventListener("openDataIngestionDrawer", handleDrawerOpen);
  }, []);

  function relativeTime(isoString: string | null | undefined): string {
    if (!isoString) return "Just now";
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);
    if (diffMin < 2) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setNotificationOpen(false);
      setProfileOpen(false);
    };

    if (notificationOpen || profileOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [notificationOpen, profileOpen]);

  const weatherIcons = {
    sunny: Sun,
    rainy: CloudRain,
    cloudy: Cloud,
  };

  const WeatherIcon = currentWeather && currentWeather.rainfallMm > 0.5
    ? weatherIcons.rainy
    : (currentWeather && currentWeather.tempCelsius < 26 ? weatherIcons.cloudy : weatherIcons.sunny);

  const weatherTempString = currentWeather ? `${Math.round(currentWeather.tempCelsius)}°C` : "28°C";

  const currentTimeLabel = currentTime.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const notificationsEnabledForType = (type: UserNotification["type"]) => {
    if (type === "opportunity" || type === "info") return true;
    if (type === "alert") return notificationPreferences.alerts;
    if (type === "suggestion") return notificationPreferences.suggestions;
    if (type === "report") return notificationPreferences.reports;
    return notificationPreferences.system;
  };

  const enabledNotifications = notifications.filter((notification) =>
    notificationsEnabledForType(notification.type),
  );

  const unreadCount = enabledNotifications.filter((n) => !n.read).length;

  const cancelIngestionClose = () => {
    if (ingestionCloseTimer.current) {
      window.clearTimeout(ingestionCloseTimer.current);
      ingestionCloseTimer.current = null;
    }
  };

  const openIngestionDrawer = () => {
    cancelIngestionClose();
    setNotificationOpen(false);
    setProfileOpen(false);
    setIngestionOpen(true);
  };

  const scheduleIngestionClose = () => {
    cancelIngestionClose();
    ingestionCloseTimer.current = window.setTimeout(() => {
      setIngestionOpen(false);
    }, 220);
  };

  useEffect(() => {
    return () => cancelIngestionClose();
  }, []);

  const getChannelIndicator = (channel: string) => {
    const status = channelStatus?.channels.find((item) => item.channel === channel);
    return {
      active: Boolean(status?.connected),
      title: status?.connected
        ? `${status.label} has uploaded data. Latest sync: ${status.latestUploadAt || status.latestTransactionAt || "available"}`
        : `${channel === "TikTok Shop" ? "TikTok" : channel} connector pending.`,
    };
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    markNotificationRead(id, userEmail).catch(() => {});
  };

  const markAllAsRead = () => {
    const selectedType = notifTab === "all" ? undefined : notifTab;
    setNotifications((prev) => prev.map((notification) =>
      !selectedType || notification.type === selectedType
        ? { ...notification, read: true }
        : notification,
    ));
    markAllNotificationsRead(userEmail, selectedType).catch(() => {});
  };

  const handleDismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    dismissNotification(id, userEmail).catch(() => {});
  };

  const handleNotificationAction = async (notification: UserNotification) => {
    markAsRead(notification.id);
    if (notification.type === "opportunity") {
      try {
        await recordOpportunityActed(notification.id, userEmail);
      } catch {
        // Non-blocking
      }
    }
    setNotificationOpen(false);
    if (!notification.targetUrl) return;
    if (notification.targetUrl.startsWith("action:openIngestionDrawer")) {
      openIngestionDrawer();
      return;
    }
    // Supports notifications stored before Traffic Optimizer moved into the
    // AI Simulation page while new backend alerts use the exact tab URL.
    const targetUrl = notification.targetUrl === "/traffic-optimizer"
      ? "/ai-simulation?tab=traffic-optimizer"
      : notification.targetUrl;
    router.push(targetUrl);
  };

  const handleSignOut = async () => {
    try { await endDashboardSession('logout'); }
    catch { toast.warning("Signed out of this app. Server sign-out will retry when connected."); }
    sessionStorage.removeItem("woofSessionActive");
    sessionStorage.removeItem("woofUserEmail");
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "opportunity": return "border-l-[#D97706]";
      case "alert": return "border-l-[#F53799]";
      case "suggestion": return "border-l-[#3AE4FA]";
      case "report": return "border-l-[#D42A7D]";
      case "system": return "border-l-[#5CE1E6]";
      default: return "border-l-[#FFD9EC]";
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-[#FFD9EC] flex items-center justify-between px-3 md:px-6 shrink-0 gap-2">
        {/* Left: Menu button (mobile) + Branding */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-[#FFF2FA] rounded-lg transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5 text-[#223047]" />
          </button>
          <div className="min-w-0">
            <div className="text-sm md:text-base font-bold text-[#223047] truncate">Happy Tails</div>
            <div className="text-xs text-[#223047] opacity-50 hidden sm:block truncate">Autonomous Revenue Intelligence</div>
          </div>
        </div>

        {/* Center: System-wide date range. Page and feature-level controls keep
            their own state; this header control only publishes the shared range. */}
        <div className="flex flex-col items-center relative flex-shrink min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Calendar className="hidden sm:block w-4 h-4 text-[#223047] opacity-50" />
              <Select
                value={dateRange.startsWith("custom:") ? "custom" : dateRange}
                onValueChange={handleDateRangeChange}
              >
                <SelectTrigger className="w-[112px] sm:w-[140px] lg:w-[170px] border-[#FFD9EC] focus:ring-[#F53799]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="center">
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last-7-days">Last 7 Days</SelectItem>
                  <SelectItem value="last-30-days">Last 30 Days</SelectItem>
                  <SelectItem value="last-90-days">Last 90 Days</SelectItem>
                  <SelectItem value="last-12-months">Last 12 Months</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(dateRange === "custom" || dateRange.startsWith("custom:")) && (
              <div className="hidden lg:flex items-center gap-2 absolute top-[115%] bg-white p-2 rounded-lg border border-[#FFD9EC] shadow-lg z-50">
                <input
                  type="date"
                  min={historyStartDate}
                  max={historyEndDate}
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="h-9 w-[130px] rounded-md border border-[#FFD9EC] px-2 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
                  title={`Historical data starts on ${historyStartDate}`}
                />
                <input
                  type="date"
                  min={customStartDate || historyStartDate}
                  max={historyEndDate}
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="h-9 w-[130px] rounded-md border border-[#FFD9EC] px-2 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
                  title={`Historical data is available through ${historyEndDate}`}
                />
                <Button
                  size="sm"
                  onClick={applyCustomDateRange}
                  className="h-9 bg-[#F53799] hover:bg-[#D42A7D] text-xs"
                >
                  Apply
                </Button>
              </div>
            )}
          </div>

        {/* Right: Status Pills, Weather, Notifications, Avatar */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          {/* Channel Status Pills */}
          <div className="hidden xl:flex items-center gap-1.5">
            {[
              { channel: "POS", label: "POS" },
              { channel: "Shopee", label: "Shopee" },
              { channel: "TikTok Shop", label: "TikTok" },
              { channel: "PetHub", label: "PetHub" },
            ].map((item) => {
              const indicator = getChannelIndicator(item.channel);
              return (
                <Badge key={item.channel} variant="outline" className="gap-1.5 border-[#FFD9EC]" title={indicator.title}>
                  <div className={`w-1.5 h-1.5 rounded-full ${indicator.active ? "bg-green-500" : "bg-amber-400"}`} />
                  <span className="text-xs">{item.label}</span>
                </Badge>
              );
            })}
          </div>

          {/* Weather Badge */}
          <Badge variant="outline" className="hidden sm:flex gap-1.5 border-[#FFD9EC]" title={currentWeather?.isSynthetic ? "Synthetic weather fallback" : `Live weather from ${currentWeather?.source || "Open-Meteo"}`}>
            <WeatherIcon className="w-3.5 h-3.5" />
            <span className="text-xs">{weatherTempString}</span>
          </Badge>

          <Badge variant="outline" className="hidden lg:flex gap-1.5 border-[#FFD9EC]" title="Current system date and time in Asia/Manila">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">{currentTimeLabel}</span>
          </Badge>

          {/* Data Ingestion Drawer Trigger */}
          <div
            onMouseEnter={openIngestionDrawer}
            onMouseLeave={scheduleIngestionClose}
            className="relative"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (ingestionOpen) {
                  setIngestionOpen(false);
                } else {
                  openIngestionDrawer();
                }
              }}
              className={`relative p-2 rounded-lg transition-colors flex-shrink-0 ${
                ingestionOpen ? "bg-[#FFF2FA] text-[#F53799]" : "hover:bg-[#FFF2FA] text-[#223047]"
              }`}
              aria-label="Open Data Ingestion Center"
            >
              <Database className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#06B6D4] ring-2 ring-white" />
            </button>
          </div>

          {/* Notification Bell */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setProfileOpen(false);
              setNotificationOpen(!notificationOpen);
            }}
            className="relative p-2 hover:bg-[#FFF2FA] rounded-lg transition-colors flex-shrink-0"
          >
            <Bell className="w-5 h-5 text-[#223047]" />
            {unreadCount > 0 && (
              <div className="absolute top-1 right-1 w-4 h-4 bg-[#F53799] text-white text-xs rounded-full flex items-center justify-center font-semibold">
                {unreadCount}
              </div>
            )}
          </button>

          {/* User Avatar */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNotificationOpen(false);
              setProfileOpen(!profileOpen);
            }}
            className="relative flex-shrink-0"
          >
            <Avatar className="w-8 h-8 md:w-9 md:h-9 border-2 border-[#FFD9EC] hover:border-[#F53799] transition-colors cursor-pointer">
              <AvatarFallback className="bg-[#F53799] text-white font-semibold text-xs md:text-sm">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </header>

      {/* Data Ingestion Slide Panel */}
      <div
        onMouseEnter={openIngestionDrawer}
        onMouseLeave={scheduleIngestionClose}
        className={`fixed top-16 right-0 bottom-0 z-50 w-[min(94vw,500px)] border-l border-[#FFD9EC] bg-white shadow-2xl transition-transform duration-300 ease-out ${
          ingestionOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!ingestionOpen}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#FFD9EC] bg-[#FFF7FB] px-4 py-3">
            <div>
              <div className="text-base font-extrabold text-[#223047]">Data Ingestion</div>
              <div className="text-xs text-[#223047] opacity-55">Upload, validate, and stage records</div>
            </div>
            <button
              onClick={() => setIngestionOpen(false)}
              className="rounded-lg p-2 text-[#223047] hover:bg-[#FFF2FA]"
              aria-label="Close Data Ingestion Center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <DataIngestion surface="drawer" />
          </div>
        </div>
      </div>

      {/* Profile Dropdown */}
      {profileOpen && (
        <>
          <div
            className="fixed inset-0 bg-transparent z-40"
            onClick={() => setProfileOpen(false)}
          />
          <div
            className="fixed top-16 right-3 md:right-6 w-[280px] bg-white border border-[#FFD9EC] rounded-2xl shadow-2xl z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#FFD9EC]">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-12 h-12 border-2 border-[#F53799]">
                  <AvatarFallback className="bg-[#F53799] text-white font-bold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-bold text-[#223047]">WOOF User</div>
                  <div className="text-xs text-[#223047] opacity-60">Happy Tails</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#223047] opacity-70">
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate">{userEmail}</span>
              </div>
            </div>
            <div className="p-2">
              <button
                onClick={() => {
                  setProfileOpen(false);
                  router.push("/settings");
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#FFF2FA] transition-colors text-left"
              >
                <User className="w-4 h-4 text-[#223047] opacity-60" />
                <span className="text-sm text-[#223047]">Profile Settings</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600 font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Notification Panel */}
      {notificationOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setNotificationOpen(false)}
          />
          <div
            className="fixed top-16 right-3 md:right-6 w-[calc(100vw-1.5rem)] md:w-[460px] max-w-[460px] bg-white border border-[#FFD9EC] rounded-2xl shadow-2xl z-50 max-h-[620px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="p-4 border-b border-[#FFD9EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#223047]">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-[#F53799] hover:underline font-medium"
                  >
                    Mark {notifTab === "all" ? "all" : notifTab} read
                  </button>
                )}
                <button
                  onClick={() => setNotificationOpen(false)}
                  className="p-1 hover:bg-[#FFF2FA] rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-[#223047]" />
                </button>
              </div>
            </div>

            {/* Tabs (Wrapped Pills so all categories are 100% visible without horizontal cut-off) */}
            <div className="flex flex-wrap items-center gap-1.5 p-3 bg-[#FFF7FB] border-b border-[#FFD9EC]">
              {([
                { label: "All", value: "all" },
                { label: "Alerts", value: "alert" },
                { label: "Traffic", value: "info" },
                { label: "Opportunities", value: "opportunity" },
                { label: "Suggestions", value: "suggestion" },
                { label: "Reports", value: "report" },
                { label: "System", value: "system" },
              ] as const).map(({ label, value }) => {
                const count =
                  value === "all"
                    ? enabledNotifications.length
                    : enabledNotifications.filter((n) => n.type === value).length;
                return (
                  <button
                    key={value}
                    onClick={() => setNotifTab(value)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      notifTab === value
                        ? "bg-[#F53799] text-white shadow-sm"
                        : "bg-white/80 text-[#223047]/75 hover:text-[#223047] hover:bg-white border border-[#FFD9EC]/60"
                    }`}
                  >
                    <span>{label}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                          notifTab === value
                            ? "bg-white/30 text-white"
                            : "bg-[#F53799]/15 text-[#F53799]"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-2">
              {(() => {
                const visible =
                  notifTab === "all"
                    ? enabledNotifications
                    : enabledNotifications.filter((n) => n.type === notifTab);
                if (visible.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-[#223047]">
                      <span className="text-xs font-black uppercase tracking-wider text-[#223047]/70 mb-1">
                        No Notifications
                      </span>
                      <p className="text-xs text-[#223047]/50">
                        All business operational updates are current.
                      </p>
                    </div>
                  );
                }
                return visible.map((notification) => (
                  <div
                    key={notification.id}
                    className={`w-full p-3.5 rounded-xl mb-2 text-left transition-all border-l-4 ${
                      notification.read
                        ? "bg-white border-[#FFD9EC]"
                        : "bg-[#FFF7FB] border-[#F53799]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                              notification.type === "opportunity"
                                ? "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]"
                                : notification.type === "info"
                                  ? "bg-[#F0F9FF] text-[#0369A1] border border-[#BAE6FD]"
                                  : notification.type === "alert"
                                    ? "bg-[#FEF2F2] text-[#991B1B] border border-[#EF4444]/30"
                                    : notification.type === "suggestion"
                                      ? "bg-[#FDF2F8] text-[#D42A7D] border border-[#F53799]/30"
                                      : notification.type === "report"
                                        ? "bg-[#F0FDF4] text-[#166534] border border-[#22C55E]/30"
                                        : "bg-[#F8FAFC] text-[#475569] border border-[#CBD5E1]"
                            }`}
                          >
                            [{notification.type === "opportunity"
                              ? "BUSINESS OPPORTUNITY"
                              : notification.type === "info"
                                ? "PREDICTED TRAFFIC"
                                : notification.type.toUpperCase()}]
                          </span>
                          <h4 className="text-xs font-bold text-[#223047] leading-snug">
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <span className="text-[9px] font-black uppercase text-[#F53799] tracking-wider ml-auto">
                              UNREAD
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#223047] opacity-80 mb-2.5 font-normal leading-relaxed">
                          {notification.message}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#FFD9EC]/40">
                          <span className="text-[10px] font-mono text-[#223047]/50">
                            {relativeTime(notification.createdAt)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleNotificationAction(notification)}
                              className="rounded bg-[#223047] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#F53799] transition-colors uppercase tracking-wider"
                            >
                              {notification.actionLabel || "OPEN"}
                            </button>
                            <button
                              onClick={(e) => handleDismissNotification(notification.id, e)}
                              className="text-[10px] font-bold text-[#223047]/50 hover:text-red-600 transition-colors uppercase tracking-wider"
                            >
                              DISMISS
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      )}
    </>
  );
}
