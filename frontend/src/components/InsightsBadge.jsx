import * as Popover from "@radix-ui/react-popover";
import CoverageList from "./CoverageList";
import PatternList from "./PatternList";

export default function InsightsBadge({
  count,
  state, patternLib, manualVacated, onUseVacated, onAssignOt, onClearPattern,
}){
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="วันลา/รูปแบบกะที่ต้องตรวจสอบ"
          className="relative inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-ink-soft
                     ring-1 ring-inset ring-line hover:text-ink hover:ring-ink-faint transition-colors
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full bg-danger text-white text-[10px] font-sans font-semibold leading-none">
              {count}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(e)=>e.preventDefault()}
          className="z-40 w-[min(90vw,520px)] max-h-[70vh] overflow-y-auto rounded-lg bg-white dark:bg-surface
                     border border-line p-1 no-print data-[state=open]:animate-fade-in"
        >
          <div className="p-2 space-y-3">
            <CoverageList
              state={state} patternLib={patternLib} manualVacated={manualVacated}
              onUseVacated={onUseVacated} onAssignOt={onAssignOt}
            />
            <PatternList patternLib={patternLib} onClearPattern={onClearPattern} />
          </div>
          <Popover.Arrow className="fill-white dark:fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
