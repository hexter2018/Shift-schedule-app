export default function Tooltip({ children, side = "bottom", width = "20rem" }){
  const posClass = side === "bottom"
    ? "top-full mt-2 left-1/2 -translate-x-1/2"
    : "bottom-full mb-2 left-1/2 -translate-x-1/2";
  return (
    <span className="relative inline-flex group/tip align-middle">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[11px] font-sans font-semibold
                   text-ink-faint ring-1 ring-inset ring-line hover:text-ink hover:ring-ink-faint
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label="ข้อมูลเพิ่มเติม"
      >
        i
      </button>
      <span
        role="tooltip"
        className={[
          "pointer-events-none absolute z-20 opacity-0 scale-95",
          "group-hover/tip:opacity-100 group-hover/tip:scale-100 group-focus-within/tip:opacity-100 group-focus-within/tip:scale-100",
          "transition-[opacity,transform] duration-100 origin-top",
          "rounded-lg bg-ink text-white text-[13px] leading-relaxed font-sans p-3 shadow-lg shadow-black/20",
          posClass,
        ].join(" ")}
        style={{ width }}
      >
        {children}
      </span>
    </span>
  );
}
