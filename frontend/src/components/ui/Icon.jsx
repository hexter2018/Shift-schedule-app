const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconPlus({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IconDownload({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
export function IconUpload({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M12 15V3m0 0 4 4m-4-4-4 4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
export function IconPrinter({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 17v4h12v-4" />
    </svg>
  );
}
export function IconSearch({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
export function IconArrowRight({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
export function IconCheck({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function IconSend({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
export function IconRefresh({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}
export function IconTool({ size = 14 }){
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4l-2.65 2.65a1.5 1.5 0 0 1-2.12-2.12L14.7 6.3Z" />
    </svg>
  );
}

export function IconAlert({ size = 14 }){
  return <svg {...base} width={size} height={size} aria-hidden="true"><path d="m10.3 3.7-7.6 13a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3l-7.6-13a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>;
}
export function IconClock({ size = 14 }){
  return <svg {...base} width={size} height={size} aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
}
export function IconUsers({ size = 14 }){
  return <svg {...base} width={size} height={size} aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
export function IconCalendar({ size = 14 }){
  return <svg {...base} width={size} height={size} aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
}
