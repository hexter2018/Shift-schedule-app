const VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/25 active:scale-[.98]",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-canvas hover:ring-ink-faint/60 shadow-xs active:scale-[.98]",
  tinted: "bg-primary-soft text-ink ring-1 ring-inset ring-line hover:bg-line-soft hover:ring-ink-faint/50 active:scale-[.98]",
  ghost: "bg-transparent text-ink-soft hover:bg-line-soft hover:text-ink active:scale-[.98]",
  "danger-ghost": "bg-transparent text-danger hover:bg-danger-soft active:scale-[.98]",
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
        "inline-flex items-center justify-center rounded-lg font-medium font-sans",
        "transition-[background-color,box-shadow,transform,color] duration-100 whitespace-nowrap select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:scale-100",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        VARIANTS[variant], SIZES[size], className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
