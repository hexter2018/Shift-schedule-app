export default function Card({ title, action, children, className = "", bodyClassName = "", noPrint = false }){
  return (
    <section className={[
      "rounded-xl bg-surface ring-1 ring-line",
      "shadow-xs shadow-black/[0.03] transition-shadow duration-150 hover:shadow-sm hover:shadow-black/[0.05]",
      noPrint ? "no-print" : "",
      className,
    ].join(" ")}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 h-12 border-b border-line">
          {title && <h3 className="font-sans text-[13.5px] font-semibold text-ink tracking-tight">{title}</h3>}
          {action}
        </div>
      )}
      <div className={["px-4 py-4", bodyClassName].join(" ")}>
        {children}
      </div>
    </section>
  );
}
