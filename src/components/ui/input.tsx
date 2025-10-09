import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "glass-input flex h-10 w-full min-w-0 rounded-xl px-4 py-2 text-base transition-all outline-none",
        "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus:border-[var(--gradient-primary-start)] focus:ring-2 focus:ring-[var(--gradient-primary-start)]/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
