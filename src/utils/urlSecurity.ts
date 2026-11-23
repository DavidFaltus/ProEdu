export interface SanitizeUrlOptions {
  /** Require explicit http: or https: URL (rejects relative paths and data: URIs). */
  httpOnly?: boolean;
}

export interface SanitizeMaterialPreviewUrlOptions {
  /** Allow strictly safe raster data:image/(png|jpeg|webp|gif);base64,... URIs (for <img> sinks only). */
  allowRasterImages?: boolean;
  /** Optional origin override for non-browser unit tests. */
  originOverride?: string;
}

export const SAFE_PDF_DATA_URL_REGEX = /^data:application\/pdf;base64,[A-Za-z0-9+/=\s]+$/i;
export const SAFE_RASTER_DATA_URL_REGEX = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function hasControlChars(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function getEffectiveOrigin(originOverride?: string): string | null {
  if (typeof originOverride === 'string' && originOverride.trim()) {
    try {
      const parsed = new URL(originOverride);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      return null;
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return null;
}

/**
 * Verifies that a URL points strictly to the current application origin (never an external
 * host, protocol-relative //host, or non-http(s) scheme) and optionally starts with a required
 * path prefix (e.g. '/api/materials/').
 *
 * Used before attaching Firebase Bearer tokens or `credentials: 'include'`.
 */
export function isSameOriginApiUrl(
  url?: string | null,
  requiredPathPrefix?: string,
  originOverride?: string
): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || hasControlChars(trimmed)) return false;

  // Reject protocol-relative URLs (//evil.com), backslash host tricks (/\evil.com, \\evil.com)
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
    return false;
  }

  const effectiveOrigin = getEffectiveOrigin(originOverride);
  const baseOrigin = effectiveOrigin ?? (trimmed.startsWith('/') ? 'https://same-origin.invalid' : null);

  // Fail closed when resolving non-relative URLs outside a browser context without an explicit origin
  if (!baseOrigin) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, baseOrigin);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (parsed.origin !== baseOrigin) {
    return false;
  }

  if (requiredPathPrefix) {
    if (!parsed.pathname.startsWith(requiredPathPrefix)) {
      return false;
    }
    if (/(?:\/|%2f)\.\.(?:\/|%2f|$)/i.test(parsed.pathname)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates URLs before passing them to href/src/window.open sinks.
 * By default allows http:, https:, same-origin relative /..., or safe raster data:image/*;base64,... URLs.
 * When `options.httpOnly` is true, allows strictly explicit http: or https: URLs only.
 */
export function sanitizeSafeUrl(
  url?: string | null,
  options?: SanitizeUrlOptions
): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (hasControlChars(trimmed)) return null;

  const httpOnly = Boolean(options?.httpOnly);

  if (!httpOnly) {
    // Allow relative paths (but reject protocol-relative //evil.com and /\evil.com)
    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
      return trimmed;
    }

    // Allow strictly safe raster data images
    if (SAFE_RASTER_DATA_URL_REGEX.test(trimmed)) {
      return trimmed;
    }
  }

  // Allow explicit http(s) URLs only
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return trimmed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Strict URL validator for material preview sinks (<iframe>, <a href>, and preview loaders).
 * Allows ONLY:
 * - Same-origin blob: URLs (or valid blob:https?:// URLs when origin is unavailable)
 * - Same-origin /api/materials/ URLs
 * - Safe https:// URLs
 * - Strict base64 PDF data URIs (^data:application/pdf;base64,[A-Za-z0-9+/=\s]+$)
 * - Optional safe raster data:image/*;base64,... when `allowRasterImages` is explicitly true
 */
export function sanitizeMaterialPreviewUrl(
  url?: string | null,
  options?: SanitizeMaterialPreviewUrlOptions
): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Reject dangerous ASCII control characters (allow whitespace inside base64 PDF payload only below)
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    return null;
  }

  // Strict base64 PDF data URI
  if (SAFE_PDF_DATA_URL_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Optional safe raster image data URI (never for iframe/link PDF sinks)
  if (options?.allowRasterImages && SAFE_RASTER_DATA_URL_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Reject any other data: URI (e.g. data:text/html, data:image/svg+xml, data:application/javascript)
  if (/^data:/i.test(trimmed)) {
    return null;
  }

  if (hasControlChars(trimmed)) {
    return null;
  }

  // Allow blob: URLs (bound to current origin when available)
  if (/^blob:/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'blob:') return null;
      const effectiveOrigin = getEffectiveOrigin(options?.originOverride);
      if (effectiveOrigin) {
        if (parsed.origin !== effectiveOrigin) return null;
      } else if (!/^blob:https?:\/\/[^\s]+$/i.test(trimmed)) {
        return null;
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  // Allow same-origin /api/materials/ URLs
  if (isSameOriginApiUrl(trimmed, '/api/materials/', options?.originOverride)) {
    return trimmed;
  }

  // Allow safe https:// URLs
  if (/^https:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:') {
        return trimmed;
      }
    } catch {
      return null;
    }
  }

  return null;
}
