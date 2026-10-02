import { Component } from "react";
import Button from "./ui/Button";

export default class AppErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state = { hasError:false, error:null };
  }
  static getDerivedStateFromError(error){
    return { hasError:true, error };
  }
  componentDidCatch(error, info){
    console.error("Schedule application error", error, info);
  }
  handleReload = ()=> window.location.reload();
  render(){
    if(!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div role="alert" className="w-full max-w-lg rounded-2xl border border-line bg-white dark:bg-surface p-6 shadow-lg">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger text-lg">!</div>
          <h1 className="mt-4 text-lg font-semibold text-ink">เกิดข้อผิดพลาดในการแสดงผล</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">ข้อมูลที่บันทึกไว้ไม่ได้ถูกลบ ระบบหยุดหน้าจอชั่วคราวเพื่อป้องกันการแก้ไขที่ไม่สมบูรณ์ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง</p>
          {import.meta.env.DEV && this.state.error?.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-canvas p-3 text-[11px] text-danger">{this.state.error.message}</pre>
          )}
          <div className="mt-5 flex justify-end">
            <Button variant="primary" onClick={this.handleReload}>โหลดหน้าใหม่</Button>
          </div>
        </div>
      </div>
    );
  }
}
