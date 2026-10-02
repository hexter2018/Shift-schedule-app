// html2canvas + jspdf are both large and only needed when someone
// actually downloads a PDF (see excel.js for the same reasoning on
// xlsx-js-style) — loaded dynamically inside downloadPDF, which is
// already async, so this costs nothing structurally.
import { THAI_MONTHS } from "./logic";

export async function downloadPDF(captureEl, state){
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(captureEl, {
    scale: 2,
    backgroundColor: "#ffffff",
    onclone: (doc)=>{
      const root = doc.getElementById("captureArea");
      if(!root) return;
      root.querySelectorAll(".no-print").forEach(e=>{ e.style.display = "none"; });
      root.querySelectorAll(".predict-dot").forEach(e=>{ e.style.display = "none"; });
      root.querySelectorAll(".day-cell.predicted").forEach(e=>{ e.style.boxShadow = "none"; });
      // table-wrap scrolls internally (bounded height, sticky header) for
      // on-screen use — for the exported image we want the whole table,
      // not just whatever's currently scrolled into view.
      root.querySelectorAll(".table-wrap").forEach(e=>{
        e.style.maxHeight = "none";
        e.style.overflow = "visible";
      });
      root.querySelectorAll("thead th").forEach(e=>{ e.style.position = "static"; });
      const pt = root.querySelector("#printTitle");
      if(pt) pt.style.display = "block";
    }
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "mm",
    format: "a3"
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const maxWidth = pageWidth - margin*2;
  const maxHeight = pageHeight - margin*2;
  const canvasRatio = canvas.width / canvas.height;
  let imgWidth = maxWidth;
  let imgHeight = imgWidth / canvasRatio;
  if(imgHeight > maxHeight){
    imgHeight = maxHeight;
    imgWidth = imgHeight * canvasRatio;
  }
  const x = (pageWidth - imgWidth) / 2;
  const y = (pageHeight - imgHeight) / 2;
  pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
  const safeDept = (state.department || "ตารางกะ").replace(/[\\/:*?"<>|]/g, "");
  pdf.save(`${safeDept}-${THAI_MONTHS[state.month-1]}-${state.yearBE}.pdf`);
}
