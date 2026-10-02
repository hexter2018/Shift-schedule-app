const VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-white dark:bg-surface text-ink ring-1 ring-inset ring-line hover:bg-canvas dark:hover:bg-white/[0.04]",
  tinted: "bg-primary-soft text-primary hover:bg-primary/15",
  ghost: "bg-transparent text-ink-soft hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-ink",
  "danger-ghost": "bg-transparent text-danger hover:bg-danger-soft",
};

const SIZES = {
  sm: "h-8 px-3 text-[13.5px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-1.5",
};

export default function Button({
  variant = "secondary", size = "md", className = "", children, ...props
}){
  return (
    <button
      className={[
        "inline-flex items-center justify-center rounded-md font-medium font-sans",
        "transition-colors duration-100 whitespace-nowrap",
        "active:scale-[0.97]",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:bg-transparent",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        VARIANTS[variant], SIZES[size], className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
