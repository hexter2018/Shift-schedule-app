const TONES = {
  neutral: "bg-canvas text-ink-soft ring-1 ring-inset ring-line",
  info: "bg-primary-soft text-primary ring-1 ring-inset ring-primary/15",
  success: "bg-success-soft text-success ring-1 ring-inset ring-success/20",
  danger: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/20",
  warning: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/20",
};

export default function Banner({ tone = "neutral", icon, children, action, className = "" }){
  return (
    <div className={[
      "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3.5 py-2 text-[13px] leading-relaxed font-sans",
      TONES[tone], className,
    ].join(" ")}>
      {icon && <span className="shrink-0 text-[15px] leading-none">{icon}</span>}
      <span className="flex-1 min-w-0">{children}</span>
      {action}
    </div>
  );
}
