import DOMPurify from 'dompurify';

/**
 * Validates URLs before passing them to href/src/window.open sinks.
 * Allows only http:, https:, same-origin relative /..., or safe raster data:image/*;base64,... URLs.
 */
export function sanitizeSafeUrl(url?: string | null): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  // Allow relative paths (but reject protocol-relative //evil.com and /\evil.com)
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
    return trimmed;
  }

  // Allow strictly safe raster data images
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
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

const FORBIDDEN_SVG_TAGS = new Set([
  'script',
  'foreignobject',
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
]);

const ANIMATION_SVG_TAGS = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'mpath',
]);

const URI_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'poster', 'data']);

let svgPurifierInstance: typeof DOMPurify | null = null;

function getSvgPurifier(): typeof DOMPurify | null {
  if (typeof window === 'undefined') return null;
  if (svgPurifierInstance) return svgPurifierInstance;

  const instance =
    typeof DOMPurify === 'function' ? DOMPurify(window) : DOMPurify;
  if (!instance || !instance.isSupported) return null;

  instance.addHook('uponSanitizeElement', (currentNode) => {
    const tag = (currentNode.nodeName || '').toLowerCase();
    if (FORBIDDEN_SVG_TAGS.has(tag)) {
      currentNode.parentNode?.removeChild(currentNode);
      return;
    }
    if (tag === 'style' && currentNode.textContent) {
      const css = currentNode.textContent;
      if (
        /@import|expression\s*\(|javascript:|vbscript:|data:text|-moz-binding|behavior\s*:|url\s*\(\s*['"]?\s*(?!#)/i.test(
          css
        )
      ) {
        currentNode.parentNode?.removeChild(currentNode);
      }
    }
  });

  instance.addHook('uponSanitizeAttribute', (currentNode, data) => {
    const attrName = (data.attrName || '').toLowerCase().trim();
    const attrVal = (data.attrValue || '').trim();
    const tag = (currentNode?.nodeName || '').toLowerCase();

    if (attrName.startsWith('on')) {
      data.keepAttr = false;
      return;
    }

    if (ANIMATION_SVG_TAGS.has(tag)) {
      if (attrName === 'href' || attrName === 'xlink:href') {
        data.keepAttr = false;
        return;
      }
      if (attrName === 'attributename') {
        const targetAttr = attrVal.replace(/[\s\u0000-\u001F]+/g, '').toLowerCase();
        if (
          targetAttr.startsWith('on') ||
          targetAttr === 'href' ||
          targetAttr === 'xlink:href' ||
          targetAttr === 'src' ||
          targetAttr === 'action' ||
          targetAttr === 'formaction'
        ) {
          data.keepAttr = false;
          return;
        }
      }
    }

    const compactVal = attrVal.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
    if (
      compactVal.includes('javascript:') ||
      compactVal.includes('vbscript:') ||
      compactVal.includes('data:text') ||
      compactVal.includes('data:image/svg+xml')
    ) {
      data.keepAttr = false;
      return;
    }

    if (URI_ATTRS.has(attrName)) {
      if (/^#[a-zA-Z0-9_.:-]+$/.test(attrVal)) {
        return;
      }
      if ((tag === 'image' || tag === 'feimage') && sanitizeSafeUrl(attrVal) !== null) {
        return;
      }
      data.keepAttr = false;
      return;
    }

    if (attrName === 'style') {
      if (
        /@import|expression\s*\(|-moz-binding|behavior\s*:|url\s*\(\s*['"]?\s*(?!#)/i.test(
          attrVal
        )
      ) {
        data.keepAttr = false;
      }
    }
  });

  svgPurifierInstance = instance;
  return svgPurifierInstance;
}

/**
 * Sanitizes SVG markup strictly using DOMPurify to prevent XSS.
 * Fails closed cleanly in non-DOM/SSR environments.
 */
export function sanitizeSvg(rawSvg: string): string {
  if (typeof rawSvg !== 'string' || !rawSvg.trim()) return '';
  if (typeof window === 'undefined') return '';

  const purifier = getSvgPurifier();
  if (!purifier) return '';

  return purifier.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      'script',
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
    ],
    ADD_ATTR: ['xlink:href', 'href', 'viewBox', 'preserveAspectRatio'],
  });
}
