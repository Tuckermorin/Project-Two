import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--gradient-primary-start)] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "gradient-bg-primary text-white shadow-md hover:shadow-lg hover:transform hover:-translate-y-0.5",
        destructive:
          "bg-[var(--text-negative)] text-white shadow-md hover:shadow-lg hover:transform hover:-translate-y-0.5",
        outline:
          "border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-sm hover:bg-[var(--glass-bg-hover)] text-[var(--text-primary)]",
        secondary:
          "gradient-bg-secondary text-white shadow-md hover:shadow-lg hover:transform hover:-translate-y-0.5",
        ghost:
          "hover:bg-[var(--glass-bg)] text-[var(--text-primary)]",
        link: "text-[var(--gradient-primary-start)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2 has-[>svg]:px-4",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-xl px-8 has-[>svg]:px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
