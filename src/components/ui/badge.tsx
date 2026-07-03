import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border-border bg-surface-hover text-foreground-secondary",
        secondary:
          "border-border bg-surface-raised text-foreground-secondary",
        outline:
          "border-border bg-transparent text-foreground-secondary",
        danger:
          "border-danger-muted bg-danger-muted text-danger",
        warning:
          "border-warning-muted bg-warning-muted text-warning",
        success:
          "border-success-muted bg-success-muted text-success",
        info:
          "border-info-muted bg-info-muted text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}
