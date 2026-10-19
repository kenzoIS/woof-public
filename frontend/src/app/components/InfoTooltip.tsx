import { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

interface InfoTooltipProps {
  label: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function InfoTooltip({ label, side = "top" }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          className="woof-info-tooltip inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#FFD9EC] bg-white text-[#F53799] shadow-sm transition-colors hover:border-[#F53799] hover:bg-[#FFF2FA] focus:outline-none focus:ring-2 focus:ring-[#F53799]/30"
          aria-label="More information"
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={8}
        className="max-w-[280px] rounded-lg bg-[#223047] px-3 py-2 text-xs leading-relaxed text-white shadow-xl"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
