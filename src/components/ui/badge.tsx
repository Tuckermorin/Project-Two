import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg px-3 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-all overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "gradient-bg-primary text-white border border-[var(--gradient-primary-end)]/30 [a&]:hover:shadow-md",
        secondary:
          "bg-[var(--glass-bg)] text-[var(--text-primary)] border border-[var(--glass-border)] [a&]:hover:bg-[var(--glass-bg-hover)]",
        destructive:
          "bg-[var(--text-negative)] text-white border border-[var(--text-negative)]/30 [a&]:hover:shadow-md",
        outline:
          "text-[var(--text-primary)] border border-[var(--glass-border)] bg-[var(--glass-bg)] [a&]:hover:bg-[var(--glass-bg-hover)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
