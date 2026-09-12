// Shared class for every text/email/number/date/select input outside the
// dense schedule table (which intentionally keeps its own compact,
// border-free cell styling — see styles.css). One height, one radius, one
// focus ring everywhere else in the app.
export const inputClass =
  "h-9 w-full rounded-lg bg-white px-3 text-[13.5px] text-ink font-sans " +
  "ring-1 ring-inset ring-line placeholder:text-ink-faint " +
  "transition-shadow duration-100 " +
  "hover:ring-ink-faint/50 " +
  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 " +
  "disabled:bg-canvas disabled:text-ink-faint disabled:cursor-not-allowed";

export default function Field({ label, htmlFor, className = "", children }){
  return (
    <div className={["flex flex-col gap-1.5", className].join(" ")}>
      {label && (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium font-sans text-ink-soft">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
