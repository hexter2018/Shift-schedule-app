import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { THAI_MONTHS } from "./logic";

export async function downloadPDF(captureEl, state){
  const canvas = await html2canvas(captureEl, {
    scale: 2,
    backgroundColor: "#ffffff",
    onclone: (doc)=>{
      const root = doc.getElementById("captureArea");
      if(!root) return;
      root.querySelectorAll(".no-print").forEach(e=>{ e.style.display = "none"; });
      root.querySelectorAll(".predict-dot").forEach(e=>{ e.style.display = "none"; });
      root.querySelectorAll(".day-cell.predicted").forEach(e=>{ e.style.boxShadow = "none"; });
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
