import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date into a user-friendly string like `Sep 4, 2025`.
 */
export function formatDate(value: Date | string | number): string {
  const date = new Date(value)
  return format(date, "MMM d, yyyy")
}

/**
 * Format a time value into a user-friendly string like `9:00 AM`.
 */
export function formatTime(value: Date | string | number): string {
  const date = new Date(value)
  return format(date, "p")
}

/**
 * Format a number with configurable decimal precision (defaults to 2 places).
 */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ""
  return Number(value).toFixed(decimals)
}
