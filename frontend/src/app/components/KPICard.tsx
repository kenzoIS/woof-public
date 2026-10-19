import { ReactNode } from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "./ui/badge";
import { InfoTooltip } from "./InfoTooltip";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string;
    direction: "up" | "down";
  };
  badge?: string;
  sparkline?: boolean;
  children?: ReactNode;
  description?: ReactNode;
}

const sanitizeTrendValue = (val: string): string => {
  const match = val.match(/^([+-]?)(\d+(?:\.\d+)?)(%.*)$/);
  if (match) {
    const sign = match[1];
    const num = parseFloat(match[2]);
    const rest = match[3];
    if (num > 100) {
      return `${sign}100.0${rest}`;
    }
  }
  return val;
};

export function KPICard({
  title,
  value,
  icon: Icon,
  iconColor = "#FFF2FA",
  trend,
  badge,
  sparkline = false,
  children,
  description,
}: KPICardProps) {
  const valueStr = String(value);
  const valueLength = valueStr.length;

  // Dynamically adjust font size based on content length
  const getFontSize = () => {
    if (valueLength <= 6) return "text-[44px]";
    if (valueLength <= 10) return "text-[32px]";
    if (valueLength <= 15) return "text-[24px]";
    return "text-[20px]";
  };
  const infoText =
    description ||
    `${title} is a key performance indicator that summarizes one important part of the selected dashboard view.`;

  return (
    <div className="bg-white border border-[#FFD9EC] rounded-[20px] p-8 space-y-4">
      {/* Top Row: Icon + Trend Badge */}
      <div className="flex items-start justify-between">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: iconColor }}
        >
          <Icon className="w-6 h-6 text-[#223047]" strokeWidth={2} />
        </div>

        {trend && Boolean(trend.value) && trend.value.trim() !== "" && (
          <Badge
            variant="outline"
            className={`gap-1 ${
              trend.direction === "up"
                ? "border-[#F53799] text-[#F53799]"
                : "border-[#223047] text-[#223047] opacity-50"
            }`}
          >
            {trend.direction === "up" ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span className="text-xs font-semibold">{sanitizeTrendValue(trend.value)}</span>
          </Badge>
        )}

        {badge && (!trend || !trend.value || trend.value.trim() === "") && (
          <Badge className="bg-[#FFF2FA] text-[#223047] border border-[#FFD9EC] hover:bg-[#FFF2FA]">
            {badge}
          </Badge>
        )}
      </div>

      {/* Title */}
      <div className="flex items-center gap-2 text-sm font-medium text-[#223047] opacity-80" style={{ lineHeight: "1.6" }}>
        <span>{title}</span>
        <InfoTooltip label={infoText} />
      </div>

      {/* Value */}
      <div className={`${getFontSize()} font-extrabold text-[#223047] leading-tight break-words overflow-hidden`}>
        {value}
      </div>
      
      {/* Sparkline or Custom Content */}
      {sparkline && (
        <div className="h-12 bg-[#FFF2FA] rounded-lg" />
      )}
      
      {children}
    </div>
  );
}
