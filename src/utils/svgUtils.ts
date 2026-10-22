/**
 * Lightweight SVG utilities for sanitization and display.
 * Kept strictly isolated from heavy PDF rendering engines (pdfjs-dist).
 */

/**
 * Sanitizes SVG string to prevent XSS (removes <script> tags and event handlers).
 */
export function sanitizeSvg(rawSvg: string): string {
  if (!rawSvg) return '';
  return rawSvg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}
