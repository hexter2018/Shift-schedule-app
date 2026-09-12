export default function Card({ title, action, children, className = "", bodyClassName = "", noPrint = false }){
  return (
    <section className={[
      "rounded-lg bg-white shadow-sm shadow-black/[0.04] ring-1 ring-black/[0.04]",
      noPrint ? "no-print" : "",
      className,
    ].join(" ")}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1 border-b border-line/70">
          {title && <h3 className="font-sans text-[13.5px] font-semibold text-ink tracking-tight">{title}</h3>}
          {action}
        </div>
      )}
      <div className={["px-4 pb-4 pt-3", bodyClassName].join(" ")}>
        {children}
      </div>
    </section>
  );
}
