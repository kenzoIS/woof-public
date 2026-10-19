import Link from "next/link";
import { useRouter } from "next/router";
import {
  Home,
  Coffee,
  Scissors,
  ShoppingBag,
  FlaskConical,
  Settings,
  MessageSquareHeart,
  FileText,
  X,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Compass,
} from "lucide-react";
import { Badge } from "./ui/badge";
import logoImg from "../../imports/happytailslogo-removebg-preview-2.png";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/cafe", label: "Cafe", icon: Coffee },
  { path: "/services", label: "Services", icon: Scissors },
  { path: "/retail", label: "Retail", icon: ShoppingBag },
  { path: "/ai-simulation", label: "AI Simulation", icon: FlaskConical },
  { path: "/smart-reports", label: "Smart Reports", icon: TrendingUp },
  { path: "/root-cause-explorer", label: "Root Cause Explorer", icon: Compass },
  { path: "/feedback", label: "Feedback", icon: MessageSquareHeart },
  { path: "/audit", label: "Audit", icon: FileText },
  { path: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const router = useRouter();

  return (
    <div
      className={`h-full bg-white border-r border-[#FFD9EC] flex flex-col relative overflow-hidden transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-[72px]" : "w-[240px]"
      }`}
    >
      {/* Left gradient bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F53799] to-[#06B6D4]" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header / Logo Area */}
        <div className={`flex items-center transition-all ${isCollapsed ? "p-3 flex-col gap-2 justify-center" : "p-5 justify-between gap-2"}`}>
          {!isCollapsed ? (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-extrabold text-[#223047] tracking-tight">WOOF</div>
                <div className="text-[11px] text-[#223047] opacity-50 font-medium truncate">by Happy Tails</div>
              </div>
              <img
                src={logoImg.src}
                alt="Happy Tails Logo"
                className="h-12 w-auto object-contain shrink-0"
                style={{ background: "transparent" }}
              />
              {/* Collapse Toggle Button for Desktop */}
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="hidden lg:flex p-1.5 hover:bg-[#FFF2FA] text-[#223047] opacity-60 hover:opacity-100 hover:text-[#F53799] rounded-lg transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <img
                src={logoImg.src}
                alt="Happy Tails Logo"
                className="h-9 w-9 object-contain shrink-0 my-1"
                style={{ background: "transparent" }}
              />
              {/* Expand Toggle Button for Desktop */}
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand sidebar"
                className="hidden lg:flex p-1.5 hover:bg-[#FFF2FA] text-[#223047] opacity-60 hover:opacity-100 hover:text-[#F53799] rounded-lg transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Close button for mobile */}
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-[#FFF2FA] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#223047]" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#FFD9EC]/70 mx-3" />

        {/* Navigation */}
        <nav className={`flex-1 py-3 space-y-1 overflow-y-auto ${isCollapsed ? "px-2" : "px-3"}`}>
          {navItems.map((item) => {
            const isActive = router.pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                title={isCollapsed ? item.label : undefined}
                className={`relative flex items-center rounded-xl transition-all group ${
                  isCollapsed
                    ? "justify-center p-2.5"
                    : "gap-3 px-3 py-2.5"
                } ${
                  isActive
                    ? "bg-[#FFF2FA] text-[#F53799] shadow-xs"
                    : "text-[#223047] opacity-60 hover:bg-[#FFF2FA] hover:text-[#D42A7D] hover:opacity-100"
                }`}
                onClick={onClose}
              >
                {isActive && (
                  <div
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-[#F53799] rounded-r-full transition-all ${
                      isCollapsed ? "h-5" : "h-6"
                    }`}
                  />
                )}
                <item.icon
                  className={`shrink-0 transition-transform group-hover:scale-110 ${
                    isCollapsed ? "w-5 h-5" : "w-5 h-5"
                  } ${isActive ? "text-[#F53799]" : ""}`}
                  strokeWidth={isActive ? 2.3 : 1.9}
                />
                {!isCollapsed && (
                  <span className="font-semibold text-sm tracking-tight truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="h-px bg-[#FFD9EC]/70 mx-3" />

        {/* System Status / Bottom Footer */}
        {!isCollapsed ? (
          <div className="p-3.5 m-2.5 bg-[#FFF2FA] border border-[#FFD9EC] rounded-xl space-y-2.5 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-[#223047]">WOOF Active</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#223047] opacity-60">Data Sync</span>
                <span className="font-semibold text-[#223047]">Live</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#223047] opacity-60">Model</span>
                <span className="font-semibold text-[#223047]">Level 3 Ready</span>
              </div>
            </div>

            <Badge className="w-full justify-center bg-[#06B6D4] text-white hover:bg-[#06B6D4] text-[10px] font-bold py-0.5">
              Live-Ready
            </Badge>
          </div>
        ) : (
          <div className="p-2 my-2 flex justify-center">
            <div
              className="w-10 h-10 rounded-xl bg-[#FFF2FA] border border-[#FFD9EC] flex items-center justify-center cursor-help hover:border-[#F53799] transition-all"
              title="WOOF Intelligence Engine: Active & Live-Ready"
            >
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}