import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format currency in whole Bangladeshi Taka (৳) */
export function formatTaka(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '৳0';
  const isNegative = amount < 0;
  const formatted = Math.abs(Math.round(amount)).toLocaleString('en-US');
  return isNegative ? `-৳${formatted}` : `৳${formatted}`;
}

/** Format standard date YYYY-MM-DD to human friendly string */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Format timestamp */
export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

/** Format date object to YYYY-MM-DD local date string (timezone safe) */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Check if given date is a Sunday */
export function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0;
}

/** Get Sunday on or before date */
export function sundayOnOrBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return toLocalDateStr(d);
}

/** Get Sunday on or after date */
export function sundayOnOrAfter(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const diff = (7 - dow) % 7;
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
}

/** Copy text to clipboard with fallback */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}


