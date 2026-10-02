import * as Dialog from "@radix-ui/react-dialog";
import ApprovalPanel from "./ApprovalPanel";
import * as Tabs from "@radix-ui/react-tabs";

export default function ApprovalDrawer({ open, onOpenChange, reviewContent, reviewBlockingCount=0, ...approvalPanelProps }){
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40 data-[state=open]:animate-fade-in no-print" />
        <Dialog.Content
          className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-white dark:bg-surface
                     border-l border-line p-4 sm:p-5 overflow-y-auto no-print
                     data-[state=open]:animate-fade-in"
        >
          <Dialog.Title className="sr-only">ส่งเพื่ออนุมัติ</Dialog.Title>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="ปิด"
              className="absolute right-4 top-4 z-10 h-7 w-7 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-canvas"
            >
              ✕
            </button>
          </Dialog.Close>
          <Tabs.Root defaultValue="review" className="mt-1">
            <Tabs.List className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1 mb-4" aria-label="ขั้นตอนอนุมัติ">
              <Tabs.Trigger value="review" className="rounded-md px-3 py-2 text-xs font-semibold text-ink-soft data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm dark:data-[state=active]:bg-surface">ตรวจสอบ {reviewBlockingCount > 0 && <span className="ml-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-danger">{reviewBlockingCount}</span>}</Tabs.Trigger>
              <Tabs.Trigger value="approval" className="rounded-md px-3 py-2 text-xs font-semibold text-ink-soft data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm dark:data-[state=active]:bg-surface">อนุมัติ</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="review">{reviewContent}</Tabs.Content>
            <Tabs.Content value="approval"><ApprovalPanel {...approvalPanelProps} reviewBlockingCount={reviewBlockingCount} /></Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
