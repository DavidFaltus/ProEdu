/**
 * Strict server-side SVG & HTML/URL sanitization utilities.
 * Zero external dependencies — deterministic character-by-character XML/SVG tokenizer
 * and strict allowlist reconstructor to protect against XSS in SVG uploads, study notes,
 * solution diagrams, and HTML email templates.
 */

const SKIP_SUBTREE_TAGS = new Set([
  'script',
  'style',
  'animate',
  'set',
  'animatemotion',
  'animatetransform',
  'animatecolor',
  'mpath',
  'foreignobject',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'meta',
  'link',
  'base',
  'audio',
  'video',
  'source',
  'track',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'noscript',
  'canvas',
  'html',
  'head',
  'body',
  'handler',
  'listener'
]);

const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'marker',
  'pattern',
  'mask',
  'clippath',
  'lineargradient',
  'radialgradient',
  'stop',
  'filter',
  'fegaussianblur',
  'feoffset',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fefunca',
  'fefuncr',
  'fefuncg',
  'fefuncb',
  'fecomposite',
  'fedropshadow',
  'feflood',
  'femerge',
  'femergenode',
  'image',
  'title',
  'desc',
  'switch'
]);

// Canonical SVG tag casing preserved on serialization
const CANONICAL_TAG_NAMES = {
  svg: 'svg',
  g: 'g',
  defs: 'defs',
  symbol: 'symbol',
  use: 'use',
  path: 'path',
  circle: 'circle',
  ellipse: 'ellipse',
  rect: 'rect',
  line: 'line',
  polyline: 'polyline',
  polygon: 'polygon',
  text: 'text',
  tspan: 'tspan',
  textpath: 'textPath',
  marker: 'marker',
  pattern: 'pattern',
  mask: 'mask',
  clippath: 'clipPath',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  stop: 'stop',
  filter: 'filter',
  fegaussianblur: 'feGaussianBlur',
  feoffset: 'feOffset',
  feblend: 'feBlend',
  fecolormatrix: 'feColorMatrix',
  fecomponenttransfer: 'feComponentTransfer',
  fefunca: 'feFuncA',
  fefuncr: 'feFuncR',
  fefuncg: 'feFuncG',
  fefuncb: 'feFuncB',
  fecomposite: 'feComposite',
  fedropshadow: 'feDropShadow',
  feflood: 'feFlood',
  femerge: 'feMerge',
  femergenode: 'feMergeNode',
  image: 'image',
  title: 'title',
  desc: 'desc',
  switch: 'switch'
};

const ALLOWED_SVG_ATTRS = new Set([
  'xmlns',
  'xmlns:xlink',
  'version',
  'id',
  'class',
  'role',
  'aria-label',
  'aria-hidden',
  'viewbox',
  'preserveaspectratio',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'dx',
  'dy',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'd',
  'points',
  'pathlength',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'color',
  'display',
  'visibility',
  'overflow',
  'transform',
  'transform-origin',
  'clip-path',
  'clip-rule',
  'mask',
  'filter',
  'style',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'text-decoration',
  'dominant-baseline',
  'alignment-baseline',
  'letter-spacing',
  'word-spacing',
  'writing-mode',
  'direction',
  'marker-start',
  'marker-mid',
  'marker-end',
  'markerwidth',
  'markerheight',
  'markerunits',
  'refx',
  'refy',
  'orient',
  'patternunits',
  'patterncontentunits',
  'patterntransform',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'fx',
  'fy',
  'offset',
  'stop-color',
  'stop-opacity',
  'stddeviation',
  'in',
  'in2',
  'result',
  'mode',
  'type',
  'values',
  'operator',
  'k1',
  'k2',
  'k3',
  'k4',
  'flood-color',
  'flood-opacity',
  'href',
  'xlink:href',
  'startoffset',
  'method',
  'spacing',
  'vector-effect',
  'shape-rendering',
  'paint-order',
  'clippathunits',
  'maskunits',
  'maskcontentunits'
]);

const CANONICAL_ATTR_NAMES = {
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  pathlength: 'pathLength',
  markerwidth: 'markerWidth',
  markerheight: 'markerHeight',
  markerunits: 'markerUnits',
  refx: 'refX',
  refy: 'refY',
  patternunits: 'patternUnits',
  patterncontentunits: 'patternContentUnits',
  patterntransform: 'patternTransform',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  spreadmethod: 'spreadMethod',
  stddeviation: 'stdDeviation',
  startoffset: 'startOffset',
  clippathunits: 'clipPathUnits',
  maskunits: 'maskUnits',
  maskcontentunits: 'maskContentUnits'
};

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
const SAFE_FRAGMENT_RE = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;
const URL_FUNC_ATTRS = new Set([
  'fill',
  'stroke',
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-mid',
  'marker-end'
]);

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function decodeXmlEntities(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/&#(\d+);?/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function sanitizeHttpUrl(rawUrl, options = {}) {
  if (typeof rawUrl !== 'string') return '';
  const { allowDataImage = false, allowMailto = false } = options;
  // Decode entities and remove ASCII control characters / whitespace tricks
  const decoded = decodeXmlEntities(rawUrl).replace(/[\u0000-\u001f\u007f]+/g, '').trim();
  if (!decoded) return '';

  const compact = decoded.replace(/\s+/g, '');
  const lower = compact.toLowerCase();

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const parsed = new URL(decoded);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      return '';
    }
    return '';
  }

  if (allowDataImage && SAFE_DATA_IMAGE_RE.test(compact)) {
    return compact;
  }

  if (allowMailto && lower.startsWith('mailto:')) {
    const emailPart = decoded.slice(7).trim();
    if (/^[^\s<>@,;:"'\\]+@[^\s<>@,;:"'\\]+\.[^\s<>@,;:"'\\]+$/.test(emailPart)) {
      return `mailto:${emailPart}`;
    }
    return '';
  }

  return '';
}

function decodeCssEscapes(cssText) {
  if (!cssText || typeof cssText !== 'string') return '';
  return cssText
    .replace(/\\(?:\r\n|[\r\n\f])/g, '')
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?/g, (_, hex) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/\\([^\r\n\f0-9a-fA-F])/g, '$1');
}

function stripCssCommentsAndNulls(cssText) {
  let out = decodeXmlEntities(cssText).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  let prev;
  do {
    prev = out;
    out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  } while (out !== prev);
  // Strip any unclosed trailing comment
  return out.replace(/\/\*[\s\S]*$/g, '');
}

function normalizeCssForInspection(cssText) {
  // Strip comments, decode CSS hex/backslash escapes, then strip comments again in case escapes formed /*...*/
  let out = stripCssCommentsAndNulls(cssText);
  out = decodeCssEscapes(out);
  out = stripCssCommentsAndNulls(out);
  return out;
}

export function sanitizeCssUrlCalls(css) {
  if (typeof css !== 'string') return '';
  const hasRawCssEscape = /\\/.test(stripCssCommentsAndNulls(css));
  const normalized = normalizeCssForInspection(css);
  const urlStartRe = /url\s*\(/gi;

  let out = '';
  let lastIdx = 0;
  let match;

  while ((match = urlStartRe.exec(normalized)) !== null) {
    out += normalized.slice(lastIdx, match.index);
    let pos = urlStartRe.lastIndex;
    let depth = 1;
    let quote = null;

    while (pos < normalized.length && depth > 0) {
      const ch = normalized[pos];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
      }
      pos++;
    }

    const closed = depth === 0;
    const inner = closed ? normalized.slice(urlStartRe.lastIndex, pos - 1) : normalized.slice(urlStartRe.lastIndex);
    const clean = inner.trim().replace(/^(['"])(.*)\1$/, '$2').trim();

    if (closed && !hasRawCssEscape && SAFE_FRAGMENT_RE.test(clean) && !hasUnsafeCssTokens(inner)) {
      out += `url(${clean})`;
    } else {
      out += 'none';
    }

    lastIdx = pos;
    urlStartRe.lastIndex = pos;
  }

  out += normalized.slice(lastIdx);
  return out;
}

function hasUnsafeCssTokens(css) {
  const normalized = normalizeCssForInspection(css).toLowerCase();
  return (
    /expression\s*\(/i.test(normalized) ||
    /javascript\s*:/i.test(normalized) ||
    /vbscript\s*:/i.test(normalized) ||
    /data\s*:/i.test(normalized) ||
    /-moz-binding\s*:/i.test(normalized) ||
    /behavior\s*:/i.test(normalized) ||
    /@import\b/i.test(normalized) ||
    /@charset\b/i.test(normalized) ||
    /\\/.test(normalized)
  );
}

function sanitizeInlineStyle(rawStyle) {
  const stripped = stripCssCommentsAndNulls(rawStyle);
  if (!stripped) return '';
  const parts = stripped.split(';');
  const safeParts = [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const rawProp = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    // Reject any CSS backslash/hex escape inside property names or values
    if (/\\/.test(rawProp) || /\\/.test(rawVal)) {
      const normalizedVal = sanitizeCssUrlCalls(rawVal).trim();
      const propLower = rawProp.toLowerCase();
      if (/^[a-z-]+$/.test(propLower) && normalizedVal === 'none' && !hasUnsafeCssTokens(rawVal)) {
        safeParts.push(`${propLower}: none`);
      }
      continue;
    }
    const prop = rawProp.toLowerCase();
    if (!/^[a-z-]+$/.test(prop) || !rawVal || hasUnsafeCssTokens(rawVal)) continue;
    const val = sanitizeCssUrlCalls(rawVal).trim();
    if (!val || hasUnsafeCssTokens(val)) continue;
    safeParts.push(`${prop}: ${val}`);
  }
  return safeParts.join('; ');
}

function sanitizeSvgAttrValue(tagName, attrLower, rawValue) {
  const decoded = decodeXmlEntities(rawValue).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

  if (attrLower.startsWith('on')) return null;

  if (attrLower === 'xmlns' || attrLower === 'xmlns:xlink') {
    const trimmed = decoded.trim();
    if (trimmed === 'http://www.w3.org/2000/svg' || trimmed === 'http://www.w3.org/1999/xlink') {
      return trimmed;
    }
    return null;
  }

  if (attrLower === 'href' || attrLower === 'xlink:href') {
    const trimmed = decoded.trim();
    if (tagName === 'image') {
      const compact = trimmed.replace(/\s+/g, '');
      if (SAFE_FRAGMENT_RE.test(trimmed) || SAFE_DATA_IMAGE_RE.test(compact)) {
        return SAFE_FRAGMENT_RE.test(trimmed) ? trimmed : compact;
      }
      return null;
    }
    if (SAFE_FRAGMENT_RE.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  if (attrLower === 'style') {
    const safeStyle = sanitizeInlineStyle(decoded);
    return safeStyle || null;
  }

  if (URL_FUNC_ATTRS.has(attrLower)) {
    if (hasUnsafeCssTokens(decoded)) return null;
    const safeVal = sanitizeCssUrlCalls(decoded);
    if (hasUnsafeCssTokens(safeVal)) return null;
    return safeVal;
  }

  if (hasUnsafeCssTokens(decoded)) {
    return null;
  }

  return decoded;
}

function parseAttributes(attrSource) {
  const attrs = [];
  let i = 0;
  const len = attrSource.length;

  while (i < len) {
    while (i < len && /[\s/]/.test(attrSource[i])) i++;
    if (i >= len) break;

    const nameStart = i;
    while (i < len && !/[\s=/>]/.test(attrSource[i])) i++;
    const rawName = attrSource.slice(nameStart, i);
    if (!rawName) break;

    while (i < len && /\s/.test(attrSource[i])) i++;

    let rawValue = '';
    if (i < len && attrSource[i] === '=') {
      i++;
      while (i < len && /\s/.test(attrSource[i])) i++;
      if (i < len && (attrSource[i] === '"' || attrSource[i] === "'" || attrSource[i] === '`')) {
        const quote = attrSource[i];
        i++;
        const valStart = i;
        while (i < len && attrSource[i] !== quote) i++;
        rawValue = attrSource.slice(valStart, i);
        if (i < len && attrSource[i] === quote) i++;
      } else {
        const valStart = i;
        while (i < len && !/[\s>]/.test(attrSource[i])) i++;
        rawValue = attrSource.slice(valStart, i);
      }
    }

    attrs.push({ name: rawName, value: rawValue });
  }

  return attrs;
}

function findTagEnd(src, startIdx) {
  let quote = null;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return src.length - 1;
}

function escapeAttrText(val) {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXmlText(val) {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitizes untrusted SVG markup using a strict tag and attribute allowlist.
 * Returns empty string if input is invalid or exceeds size limit.
 */
export function sanitizeSvg(rawSvg, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (typeof rawSvg !== 'string') return '';
  if (rawSvg.length === 0 || Buffer.byteLength(rawSvg, 'utf8') > maxBytes) {
    return '';
  }

  let out = '';
  let i = 0;
  let skipTagStack = [];
  let svgDepth = 0;
  const n = rawSvg.length;

  while (i < n) {
    const lt = rawSvg.indexOf('<', i);
    if (lt === -1) {
      const text = rawSvg.slice(i);
      if (skipTagStack.length === 0 && svgDepth > 0) {
        out += escapeXmlText(decodeXmlEntities(text));
      }
      break;
    }

    if (lt > i) {
      const text = rawSvg.slice(i, lt);
      if (skipTagStack.length === 0 && svgDepth > 0) {
        out += escapeXmlText(decodeXmlEntities(text));
      }
    }

    // Strip XML comments
    if (rawSvg.startsWith('<!--', lt)) {
      const commentEnd = rawSvg.indexOf('-->', lt + 4);
      i = commentEnd === -1 ? n : commentEnd + 3;
      continue;
    }

    // Strip CDATA blocks (do not execute nested markup from CDATA)
    if (rawSvg.startsWith('<![CDATA[', lt)) {
      const cdataEnd = rawSvg.indexOf(']]>', lt + 9);
      i = cdataEnd === -1 ? n : cdataEnd + 3;
      continue;
    }

    // Strip processing instructions (<?xml...?>, <?xml-stylesheet...?>) and DOCTYPE/ENTITY declarations
    if (rawSvg.startsWith('<?', lt)) {
      const piEnd = rawSvg.indexOf('?>', lt + 2);
      i = piEnd === -1 ? n : piEnd + 2;
      continue;
    }
    if (rawSvg.startsWith('<!', lt)) {
      const declEnd = rawSvg.indexOf('>', lt + 2);
      i = declEnd === -1 ? n : declEnd + 1;
      continue;
    }

    const gt = findTagEnd(rawSvg, lt + 1);
    const tagInner = rawSvg.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (!tagInner) continue;

    // Handle closing tag
    if (tagInner.startsWith('/')) {
      const rawCloseName = tagInner.slice(1).trim().split(/[\s/]/)[0] || '';
      const lowerClose = rawCloseName.toLowerCase().replace(/^svg:/, '');

      if (skipTagStack.length > 0) {
        const idx = skipTagStack.lastIndexOf(lowerClose);
        if (idx !== -1) {
          skipTagStack = skipTagStack.slice(0, idx);
        }
        continue;
      }

      if (ALLOWED_SVG_TAGS.has(lowerClose) && svgDepth > 0) {
        const canonical = CANONICAL_TAG_NAMES[lowerClose] || lowerClose;
        out += `</${canonical}>`;
        if (lowerClose === 'svg') {
          svgDepth = Math.max(0, svgDepth - 1);
        }
      }
      continue;
    }

    // Opening or self-closing tag
    const selfClosing = tagInner.endsWith('/');
    const cleanInner = selfClosing ? tagInner.slice(0, -1).trim() : tagInner;
    const spaceMatch = cleanInner.match(/^([^\s/]+)([\s\S]*)$/);
    if (!spaceMatch) continue;

    const rawTagName = spaceMatch[1];
    const lowerTag = rawTagName.toLowerCase().replace(/^svg:/, '');
    const attrStr = spaceMatch[2] || '';

    if (skipTagStack.length > 0) {
      if (!selfClosing && SKIP_SUBTREE_TAGS.has(lowerTag)) {
        skipTagStack.push(lowerTag);
      }
      continue;
    }

    if (SKIP_SUBTREE_TAGS.has(lowerTag)) {
      if (!selfClosing) {
        skipTagStack.push(lowerTag);
      }
      continue;
    }

    if (!ALLOWED_SVG_TAGS.has(lowerTag)) {
      continue;
    }

    if (svgDepth === 0 && lowerTag !== 'svg') {
      continue;
    }

    if (lowerTag === 'svg') {
      svgDepth++;
    }

    const parsedAttrs = parseAttributes(attrStr);
    const seenAttrs = new Set();
    const rebuiltAttrs = [];

    for (const { name, value } of parsedAttrs) {
      const attrLower = name.toLowerCase().trim();
      if (!attrLower || seenAttrs.has(attrLower)) continue;
      if (attrLower.startsWith('on')) continue;
      if (!ALLOWED_SVG_ATTRS.has(attrLower)) continue;

      const safeVal = sanitizeSvgAttrValue(lowerTag, attrLower, value);
      if (safeVal === null) continue;

      seenAttrs.add(attrLower);
      const canonicalAttr = CANONICAL_ATTR_NAMES[attrLower] || attrLower;
      rebuiltAttrs.push(`${canonicalAttr}="${escapeAttrText(safeVal)}"`);
    }

    // Ensure root <svg> carries standard SVG namespace
    if (lowerTag === 'svg' && !seenAttrs.has('xmlns')) {
      rebuiltAttrs.unshift('xmlns="http://www.w3.org/2000/svg"');
    }

    const canonicalTag = CANONICAL_TAG_NAMES[lowerTag] || lowerTag;
    const attrOutput = rebuiltAttrs.length > 0 ? ` ${rebuiltAttrs.join(' ')}` : '';

    if (selfClosing) {
      out += `<${canonicalTag}${attrOutput}/>`;
      if (lowerTag === 'svg') {
        svgDepth = Math.max(0, svgDepth - 1);
      }
    } else {
      out += `<${canonicalTag}${attrOutput}>`;
    }
  }

  return out.trim();
}
