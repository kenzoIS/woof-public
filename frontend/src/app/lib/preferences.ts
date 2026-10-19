import { getBackendConnection } from "./backendConnection";
export type NotificationPreferenceKey = "alerts" | "suggestions" | "reports" | "system";
export type ColorThemeKey = "pink" | "ocean" | "mint" | "slate" | "custom";

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export type BusinessProfilePreferences = {
  businessName: string;
  branchName: string;
  location: string;
  timezone: string;
  currency: string;
  openingTime: string;
  closingTime: string;
};

export type CustomThemePreferences = {
  primary: string;
  accent: string;
  surface: string;
};

export type DashboardChartView = "monthly" | "weekly" | "daily";

export type DashboardPreferences = {
  compactKpiCards: boolean;
  showDemoControls: boolean;
  showTooltips: boolean;
  sidebarCollapsedByDefault: boolean;
};

export type SecurityPreferences = {
  sessionTimeoutMinutes: number;
};

export type AlertThresholdPreferences = {
  capacityWarning: number;
  lowInventory: number;
  forecastAccuracyWarning: number;
  dataStalenessDays: number;
};

export type SettingsPreferences = {
  businessProfile: BusinessProfilePreferences;
  notifications: NotificationPreferences;
  alertThresholds: AlertThresholdPreferences;
  dashboard: DashboardPreferences;
  security: SecurityPreferences;
  dataRetention: number;
  theme: "light" | "dark";
  colorTheme: ColorThemeKey;
  customTheme: CustomThemePreferences;
};

export const DEFAULT_SETTINGS_PREFERENCES: SettingsPreferences = {
  businessProfile: {
    businessName: "Happy Tails",
    branchName: "Main Branch",
    location: "Lucena City, Philippines",
    timezone: "Asia/Manila",
    currency: "PHP",
    openingTime: "08:00",
    closingTime: "20:00",
  },
  notifications: {
    alerts: true,
    suggestions: true,
    reports: false,
    system: true,
  },
  alertThresholds: {
    capacityWarning: 85,
    lowInventory: 20,
    forecastAccuracyWarning: 80,
    dataStalenessDays: 7,
  },
  dashboard: {
    compactKpiCards: false,
    showDemoControls: false,
    showTooltips: true,
    sidebarCollapsedByDefault: false,
  },
  security: {
    sessionTimeoutMinutes: 10,
  },
  dataRetention: 90,
  theme: "light",
  colorTheme: "pink",
  customTheme: {
    primary: "#F53799",
    accent: "#06B6D4",
    surface: "#FFF7FB",
  },
};

let preferenceTimer: ReturnType<typeof setTimeout> | undefined;
let hydrated = false;
let revision = 0;
let pendingSave: Promise<void> = Promise.resolve();
let importing = false;

export async function flushSettingsPreferences() {
  if (preferenceTimer) clearTimeout(preferenceTimer);
  const snapshot = getSettingsPreferences();
  const save = async () => {
    const response = await fetch(`${getBackendConnection().apiUrl}/settings/preferences`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error('Preferences are saved locally; server sync failed. Please retry Save Settings.');
  };
  pendingSave = pendingSave.catch(() => {}).then(save);
  return pendingSave;
}

export async function hydrateSettingsPreferences() {
  if (hydrated) return;
  const before = revision;
  const response = await fetch(`${getBackendConnection().apiUrl}/settings/preferences`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) return;
  const values = await response.json();
  hydrated = true;
  if (!values || before !== revision) return;
  importing = true;
  try { saveSettingsPreferences({ ...getSettingsPreferences(), ...values }); }
  finally { importing = false; }
}

const SETTINGS_KEY = "woofSettingsPreferences";
const LEGACY_THEME_KEY = "woofTheme";
const LEGACY_SIDEBAR_KEY = "woofSidebarCollapsed";
const CHART_VIEW_KEY = "woofDashboardChartView";
const PREFERENCES_EVENT = "woof:settings-preferences-changed";
const THEME_CLASSES = ["woof-theme-pink", "woof-theme-ocean", "woof-theme-mint", "woof-theme-slate", "woof-theme-custom"];
const DASHBOARD_CLASSES = ["woof-compact-kpis", "woof-show-demo-controls", "woof-hide-tooltips", "woof-sidebar-default-collapsed"];

function normalizeHexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeChartView(value: unknown): DashboardChartView {
  return value === "weekly" || value === "daily"
    ? value
    : "monthly";
}

function normalizePreferences(value: Partial<SettingsPreferences> | null): SettingsPreferences {
  return {
    ...DEFAULT_SETTINGS_PREFERENCES,
    ...value,
    notifications: {
      ...DEFAULT_SETTINGS_PREFERENCES.notifications,
      ...(value?.notifications ?? {}),
    },
    alertThresholds: {
      capacityWarning: normalizeNumber(value?.alertThresholds?.capacityWarning, DEFAULT_SETTINGS_PREFERENCES.alertThresholds.capacityWarning, 1, 100),
      lowInventory: normalizeNumber(value?.alertThresholds?.lowInventory, DEFAULT_SETTINGS_PREFERENCES.alertThresholds.lowInventory, 1, 100),
      forecastAccuracyWarning: normalizeNumber(value?.alertThresholds?.forecastAccuracyWarning, DEFAULT_SETTINGS_PREFERENCES.alertThresholds.forecastAccuracyWarning, 1, 100),
      dataStalenessDays: normalizeNumber(value?.alertThresholds?.dataStalenessDays, DEFAULT_SETTINGS_PREFERENCES.alertThresholds.dataStalenessDays, 1, 60),
    },
    dashboard: {
      compactKpiCards: Boolean(value?.dashboard?.compactKpiCards ?? DEFAULT_SETTINGS_PREFERENCES.dashboard.compactKpiCards),
      showDemoControls: Boolean(value?.dashboard?.showDemoControls ?? DEFAULT_SETTINGS_PREFERENCES.dashboard.showDemoControls),
      showTooltips: Boolean(value?.dashboard?.showTooltips ?? DEFAULT_SETTINGS_PREFERENCES.dashboard.showTooltips),
      sidebarCollapsedByDefault: Boolean(value?.dashboard?.sidebarCollapsedByDefault ?? DEFAULT_SETTINGS_PREFERENCES.dashboard.sidebarCollapsedByDefault),
    },
    security: {
      sessionTimeoutMinutes: normalizeNumber(
        value?.security?.sessionTimeoutMinutes,
        DEFAULT_SETTINGS_PREFERENCES.security.sessionTimeoutMinutes,
        1,
        120,
      ),
    },
    businessProfile: {
      ...DEFAULT_SETTINGS_PREFERENCES.businessProfile,
      ...(value?.businessProfile ?? {}),
    },
    dataRetention:
      typeof value?.dataRetention === "number"
        ? value.dataRetention
        : DEFAULT_SETTINGS_PREFERENCES.dataRetention,
    theme: value?.theme === "dark" ? "dark" : "light",
    colorTheme:
      value?.colorTheme === "ocean" || value?.colorTheme === "mint" || value?.colorTheme === "slate" || value?.colorTheme === "custom"
        ? value.colorTheme
        : DEFAULT_SETTINGS_PREFERENCES.colorTheme,
    customTheme: {
      primary: normalizeHexColor(value?.customTheme?.primary, DEFAULT_SETTINGS_PREFERENCES.customTheme.primary),
      accent: normalizeHexColor(value?.customTheme?.accent, DEFAULT_SETTINGS_PREFERENCES.customTheme.accent),
      surface: normalizeHexColor(value?.customTheme?.surface, DEFAULT_SETTINGS_PREFERENCES.customTheme.surface),
    },
  };
}

export function getSettingsPreferences(): SettingsPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS_PREFERENCES;
  }

  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    const parsed = saved ? JSON.parse(saved) as Partial<SettingsPreferences> : null;
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const legacySidebarCollapsed = localStorage.getItem(LEGACY_SIDEBAR_KEY);
    return normalizePreferences({
      ...parsed,
      dashboard: {
        ...DEFAULT_SETTINGS_PREFERENCES.dashboard,
        ...(parsed?.dashboard ?? {}),
        sidebarCollapsedByDefault:
          parsed?.dashboard?.sidebarCollapsedByDefault ??
          (legacySidebarCollapsed === null
            ? DEFAULT_SETTINGS_PREFERENCES.dashboard.sidebarCollapsedByDefault
            : legacySidebarCollapsed === "true"),
      },
      theme: parsed?.theme ?? (legacyTheme === "dark" ? "dark" : "light"),
    });
  } catch {
    return DEFAULT_SETTINGS_PREFERENCES;
  }
}

export function saveSettingsPreferences(
  next:
    | SettingsPreferences
    | ((current: SettingsPreferences) => SettingsPreferences),
): SettingsPreferences {
  const current = getSettingsPreferences();
  const preferences = normalizePreferences(
    typeof next === "function" ? next(current) : next,
  );

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
      localStorage.setItem(LEGACY_THEME_KEY, preferences.theme);
      localStorage.setItem(LEGACY_SIDEBAR_KEY, String(preferences.dashboard.sidebarCollapsedByDefault));
      window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, { detail: preferences }));
      if (!importing && JSON.stringify(current) !== JSON.stringify(preferences)) {
        revision++;
        if (sessionStorage.getItem('woofSessionActive') === 'true' && sessionStorage.getItem('woofSessionEnded') !== 'true') {
          if (preferenceTimer) clearTimeout(preferenceTimer);
          preferenceTimer = setTimeout(() => { void flushSettingsPreferences().catch(() => {
            window.dispatchEvent(new CustomEvent('woof:preferences-sync-failed'));
          }); }, 600);
        }
      }
    } catch {
      // Keep the UI responsive even when browser storage is unavailable.
    }
  }

  return preferences;
}

export function applyDocumentColorTheme(
  colorTheme: ColorThemeKey,
  customTheme = DEFAULT_SETTINGS_PREFERENCES.customTheme,
) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(...THEME_CLASSES);
    document.documentElement.classList.add(`woof-theme-${colorTheme}`);

    if (colorTheme === "custom") {
      document.documentElement.style.setProperty("--woof-custom-primary", customTheme.primary);
      document.documentElement.style.setProperty("--woof-custom-primary-strong", customTheme.primary);
      document.documentElement.style.setProperty("--woof-custom-accent", customTheme.accent);
      document.documentElement.style.setProperty("--woof-custom-accent-soft", customTheme.accent);
      document.documentElement.style.setProperty("--woof-custom-surface", customTheme.surface);
      document.documentElement.style.setProperty("--woof-custom-background", customTheme.surface);
      document.documentElement.style.setProperty("--woof-custom-border", customTheme.accent);
    } else {
      [
        "--woof-custom-primary",
        "--woof-custom-primary-strong",
        "--woof-custom-accent",
        "--woof-custom-accent-soft",
        "--woof-custom-surface",
        "--woof-custom-background",
        "--woof-custom-border",
      ].forEach((name) => document.documentElement.style.removeProperty(name));
    }
  }
}

export function getDashboardChartView(): DashboardChartView {
  if (typeof window === "undefined") {
    return "monthly";
  }
  return normalizeChartView(localStorage.getItem(CHART_VIEW_KEY));
}

export function saveDashboardChartView(value: DashboardChartView) {
  const normalized = normalizeChartView(value);
  if (typeof window !== "undefined") {
    localStorage.setItem(CHART_VIEW_KEY, normalized);
  }
  return normalized;
}

export function applyDocumentDashboardPreferences(
  dashboard = DEFAULT_SETTINGS_PREFERENCES.dashboard,
) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(...DASHBOARD_CLASSES);
    document.documentElement.classList.toggle("woof-compact-kpis", dashboard.compactKpiCards);
    document.documentElement.classList.toggle("woof-show-demo-controls", dashboard.showDemoControls);
    document.documentElement.classList.toggle("woof-hide-tooltips", !dashboard.showTooltips);
    document.documentElement.classList.toggle("woof-sidebar-default-collapsed", dashboard.sidebarCollapsedByDefault);
  }
}

export function applyStoredTheme() {
  const preferences = getSettingsPreferences();
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("woof-dark", preferences.theme === "dark");
    applyDocumentColorTheme(preferences.colorTheme, preferences.customTheme);
    applyDocumentDashboardPreferences(preferences.dashboard);
  }
  return preferences.theme;
}

export function onSettingsPreferencesChanged(callback: (preferences: SettingsPreferences) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    callback((event as CustomEvent<SettingsPreferences>).detail ?? getSettingsPreferences());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY || event.key === LEGACY_THEME_KEY) {
      callback(getSettingsPreferences());
    }
  };

  window.addEventListener(PREFERENCES_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(PREFERENCES_EVENT, handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
