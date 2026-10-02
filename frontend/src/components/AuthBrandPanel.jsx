// Shared left/top panel for the login and department-picker screens —
// these were the blandest screens in the app (a plain centered card on
// empty gray), and the only ones with no visual identity at all. Soft
// overlapping circles (violet + pink, both already in the palette) read
// gentler than the earlier amber barrier-stripe motif — a better fit
// once the whole system moved to this rounder, softer direction; a
// hard-edged hazard stripe would sit oddly against rounded corners and
// a warmer palette everywhere else.
export default function AuthBrandPanel(){
  return (
    <div className="relative overflow-hidden bg-[var(--color-primary)] text-white
                     px-8 py-10 sm:px-10 sm:py-12 lg:py-16
                     flex flex-col justify-between
                     lg:w-[340px] lg:shrink-0">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-25" style={{background: "var(--color-secondary)"}} aria-hidden="true" />
      <div className="absolute -right-16 top-24 w-28 h-28 rounded-full opacity-20" style={{background: "#ffffff"}} aria-hidden="true" />
      <div className="absolute -right-6 bottom-16 w-20 h-20 rounded-full opacity-25" style={{background: "var(--color-secondary)"}} aria-hidden="true" />
      <div className="relative">
        <div className="text-[15px] font-sans font-semibold tracking-tight opacity-70">BEM</div>
        <h1 className="mt-3 font-sans text-[28px] leading-tight font-semibold">
          ระบบตารางกะ
        </h1>
        <p className="mt-3 font-sans text-[14px] leading-relaxed text-white/70 max-w-[240px]">
          จัดตารางกะ ขออนุมัติ และติดตามสถานะ ในที่เดียว
        </p>
      </div>
      <p className="relative font-sans text-[12px] text-white/45">
        ส่วนวิศวกรรมระบบเก็บเงินค่าผ่านทาง
      </p>
    </div>
  );
}
