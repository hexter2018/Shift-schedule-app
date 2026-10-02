import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-sans font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-white",
        outline: "border-line text-ink-soft bg-transparent",
      },
    },
    defaultVariants: { variant: "outline" },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
