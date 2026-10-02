import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-lg bg-slate-900 dark:bg-slate-800 dark:ring-1 dark:ring-white/10",
          "px-3 py-2 text-[13px] leading-relaxed text-white font-sans shadow-lg shadow-black/20",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
