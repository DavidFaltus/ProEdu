import DOMPurify from 'dompurify';
import {
  sanitizeSafeUrl,
  isSameOriginApiUrl,
  sanitizeMaterialPreviewUrl,
  type SanitizeUrlOptions,
} from './urlSecurity';

export {
  sanitizeSafeUrl,
  isSameOriginApiUrl,
  sanitizeMaterialPreviewUrl,
  type SanitizeUrlOptions,
};

export const SVG_FORBID_TAGS = [
  'script',
  'style',
  'animate',
  'set',
  'animatemotion',
  'animateMotion',
  'animatetransform',
  'animateTransform',
  'animatecolor',
  'animateColor',
  'mpath',
  'foreignobject',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'a',
  'base',
  'meta',
  'link',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'frame',
  'frameset',
  'applet',
] as const;

const FORBIDDEN_SVG_TAGS = new Set(SVG_FORBID_TAGS.map((tag) => tag.toLowerCase()));

const URI_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'poster', 'data']);

const SVG_CSS_URL_ATTRS = new Set([
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
  'marker-start',
  'marker-mid',
  'marker-end',
  'cursor',
]);

export function isForbiddenSvgTag(tagName: string): boolean {
  return FORBIDDEN_SVG_TAGS.has((tagName || '').toLowerCase().trim());
}

/**
 * Checks whether a CSS string (e.g. inline `style` or SVG presentation attribute)
 * contains unsafe constructs such as external `url(...)`, `@import`, `expression(...)`,
 * `javascript:`, CSS backslash/hex escape obfuscations (e.g. `\75rl(...)`), or
 * CSS comment-splitting tricks.
 */
export function hasUnsafeCssValue(css: string): boolean {
  if (typeof css !== 'string' || !css) return false;

  // Reject control chars and CSS backslash/hex escapes (e.g. \75rl(...))
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(css) || css.includes('\\')) {
    return true;
  }

  // Strip CSS comments (including unclosed /*) so url/**/(...) cannot bypass filtering
  const stripped = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');

  if (
    /@\s*import|@\s*charset|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text|data\s*:\s*image\/svg|-moz-binding|behavior\s*:/i.test(
      stripped
    )
  ) {
    return true;
  }

  // Inspect every url(...) call: only allow local fragment references like url(#grad1)
  const urlCallRegex = /url\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlCallRegex.exec(stripped)) !== null) {
    const inner = (match[1] || '').trim().replace(/^['"]|['"]$/g, '').trim();
    if (!/^#[a-zA-Z0-9_.:-]+$/.test(inner)) {
      return true;
    }
  }

  // Reject unclosed / malformed url( calls
  if (/url\s*\(/i.test(stripped.replace(urlCallRegex, ''))) {
    return true;
  }

  return false;
}

export function isAllowedSvgAttribute(
  tagName: string,
  rawAttrName: string,
  rawAttrValue: string
): boolean {
  const attrName = (rawAttrName || '').toLowerCase().trim();
  const attrVal = (rawAttrValue || '').trim();
  const tag = (tagName || '').toLowerCase().trim();

  if (attrName.startsWith('on') || isForbiddenSvgTag(tag)) {
    return false;
  }

  const compactVal = attrVal.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  if (
    compactVal.includes('javascript:') ||
    compactVal.includes('vbscript:') ||
    compactVal.includes('data:text') ||
    compactVal.includes('data:image/svg+xml')
  ) {
    return false;
  }

  if (URI_ATTRS.has(attrName)) {
    if (/^#[a-zA-Z0-9_.:-]+$/.test(attrVal)) {
      return true;
    }
    if ((tag === 'image' || tag === 'feimage') && sanitizeSafeUrl(attrVal) !== null) {
      return true;
    }
    return false;
  }

  if (attrName === 'style' || SVG_CSS_URL_ATTRS.has(attrName)) {
    return !hasUnsafeCssValue(attrVal);
  }

  return true;
}

let svgPurifierInstance: typeof DOMPurify | null = null;

function getSvgPurifier(): typeof DOMPurify | null {
  if (typeof window === 'undefined') return null;
  if (svgPurifierInstance) return svgPurifierInstance;

  const instance =
    typeof DOMPurify === 'function' ? DOMPurify(window) : DOMPurify;
  if (!instance || !instance.isSupported) return null;

  instance.addHook('uponSanitizeElement', (currentNode) => {
    const tag = (currentNode.nodeName || '').toLowerCase();
    if (isForbiddenSvgTag(tag)) {
      currentNode.parentNode?.removeChild(currentNode);
    }
  });

  instance.addHook('uponSanitizeAttribute', (currentNode, data) => {
    const tag = (currentNode?.nodeName || '').toLowerCase();
    if (!isAllowedSvgAttribute(tag, data.attrName || '', data.attrValue || '')) {
      data.keepAttr = false;
    }
  });

  svgPurifierInstance = instance;
  return svgPurifierInstance;
}

/**
 * Sanitizes SVG markup strictly using DOMPurify to prevent XSS, global CSS injection,
 * and SMIL animation tricks. Fails closed cleanly in non-DOM/SSR environments.
 */
export function sanitizeSvg(rawSvg: string): string {
  if (typeof rawSvg !== 'string' || !rawSvg.trim()) return '';
  if (typeof window === 'undefined') return '';

  const purifier = getSvgPurifier();
  if (!purifier) return '';

  return purifier.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [...SVG_FORBID_TAGS],
    ADD_ATTR: ['xlink:href', 'href', 'viewBox', 'preserveAspectRatio'],
  });
}
