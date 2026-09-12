import Card from "./ui/Card";
import Button from "./ui/Button";

export default function PatternList({ patternLib, onClearPattern }){
  const keys = Object.keys(patternLib);
  return (
    <Card noPrint title="รูปแบบกะที่วิเคราะห์ไว้ (ต่อพนักงาน)">
      <div className="flex flex-col gap-2">
        {keys.length===0 && (
          <div className="text-[13.5px] font-sans text-ink-faint">ยังไม่มีรูปแบบที่บันทึกไว้ — กรอกตารางเดือนแรกให้ครบแล้วกด "วิเคราะห์รูปแบบ"</div>
        )}
        {keys.map(key=>{
          const p = patternLib[key];
          const confLabel = p.confidence==="high" ? "แม่นยำ" : "ความมั่นใจต่ำ";
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-[13.5px] font-sans">
              <span className="font-semibold text-ink min-w-[160px]">{p.label || key}</span>
              <span className="text-ink-soft flex-1">รอบ {p.length} วัน: {p.cycle.map(v=>v||"–").join(" · ")}</span>
              <span className={
                "rounded-full px-2 py-0.5 text-[12px] font-medium " +
                (p.confidence==='low' ? "bg-primary-soft text-primary" : "bg-success-soft text-success")
              }>{confLabel}</span>
              <Button variant="danger-ghost" size="sm" onClick={()=>onClearPattern(key)}>ล้างรูปแบบ</Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
