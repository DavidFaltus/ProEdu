import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && 'toDate' in val && typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
