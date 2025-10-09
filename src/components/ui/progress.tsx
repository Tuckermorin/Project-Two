"use client"

import * as React from "react"
import type { ElementRef } from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"
const Progress = React.forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full",
      className
    )}
    style={{
      background: 'rgba(255, 255, 255, 0.1)'
    }}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 gradient-bg-success rounded-full transition-all duration-500"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }