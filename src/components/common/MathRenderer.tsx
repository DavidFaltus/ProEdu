import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katex from 'katex';

export interface MathRendererProps {
  content?: string | null;
  inline?: boolean;
  className?: string;
  imageMap?: Record<string, string>;
}

const ALLOWED_HTML_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'a', 'figure', 'figcaption', 'img',
  'div', 'span', 'blockquote', 'br', 'hr', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td'
]);

const ALLOWED_HTML_ATTRS = new Set([
  'class', 'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height'
]);

/**
 * Checks whether content contains HTML block/formatting tags (such as <p>, <h2>, <h3>, <figure>, <img>, <ul>, <div class="tip-box">).
 */
function containsRichHtml(text: string): boolean {
  if (!text) return false;
  return /<\s*\/?\s*(p|h[1-6]|strong|b|em|i|u|s|mark|small|sub|sup|ul|ol|li|a|figure|figcaption|img|div|span|blockquote|br|hr|code|pre|table)\b[^>]*>/i.test(text);
}

/**
 * Safely sanitizes rich HTML while rendering embedded KaTeX ($...$ and $$...$$) and resolving uploaded theory images.
 */
function renderSanitizedHtmlWithMath(rawHtml: string, imageMap?: Record<string, string>): string {
  if (!rawHtml) return '';

  // 1. Replace math segments ($...$ and $$...$$) with placeholders so DOMParser doesn't alter math symbols
  const mathPlaceholders: string[] = [];
  const withPlaceholders = rawHtml.replace(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g, (match) => {
    const isDisplay = match.startsWith('$$') && match.endsWith('$$') && match.length >= 4;
    const rawMath = (isDisplay ? match.slice(2, -2) : match.slice(1, -1))
      .trim()
      .replace(/\\frac\{/g, '\\dfrac{');
    try {
      const rendered = katex.renderToString(rawMath, {
        displayMode: isDisplay,
        throwOnError: false,
        strict: false
      });
      const idx = mathPlaceholders.length;
      mathPlaceholders.push(rendered);
      return `__PROEDU_KATEX_PLACEHOLDER_${idx}__`;
    } catch {
      return match;
    }
  });

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return withPlaceholders;
  }

  // 2. Parse and sanitize HTML via DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(withPlaceholders, 'text/html');

  const sanitizeNode = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (!ALLOWED_HTML_TAGS.has(tag)) {
          // Completely remove dangerous tags like script, style, iframe, object, embed
          if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'].includes(tag)) {
            el.remove();
            continue;
          }
          // Unwrap unknown benign tags into their text/children
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el);
          }
          el.remove();
          continue;
        }

        // Filter attributes
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const attrName = attr.name.toLowerCase();
          if (!ALLOWED_HTML_ATTRS.has(attrName) || attrName.startsWith('on')) {
            el.removeAttribute(attr.name);
          }
        }

        if (tag === 'a') {
          const href = (el.getAttribute('href') || '').trim();
          if (href && !/^(https?:\/\/|mailto:|\/|#)/i.test(href)) {
            el.removeAttribute('href');
          } else {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        }

        if (tag === 'img') {
          const rawSrc = (el.getAttribute('src') || '').trim();
          const resolvedSrc = (imageMap && rawSrc && imageMap[rawSrc]) ? imageMap[rawSrc] : rawSrc;
          if (resolvedSrc && /^(https?:\/\/|\/|data:image\/|blob:|assets\/|uploads\/)/i.test(resolvedSrc)) {
            el.setAttribute('src', resolvedSrc);
            el.setAttribute('loading', 'lazy');
          } else {
            el.remove();
            continue;
          }
        }

        sanitizeNode(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    }
  };

  sanitizeNode(doc.body);

  let cleanHtml = doc.body.innerHTML;

  // 3. Restore KaTeX HTML placeholders
  cleanHtml = cleanHtml.replace(/__PROEDU_KATEX_PLACEHOLDER_(\d+)__/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return mathPlaceholders[idx] ?? '';
  });

  return cleanHtml;
}

/**
 * Ensures bare LaTeX expressions (like \frac{1}{2} or \sqrt{x}) that were entered without $...$
 * get wrapped in delimiters so they render properly in Markdown.
 */
function normalizeMathDelimiters(text: string): string {
  if (!text) return '';
  
  let s = text.replace(/\\frac\{/g, '\\dfrac{');

  // If text already has $, return
  if (s.includes('$')) {
    return s;
  }

  // Check if string contains standard LaTeX math commands without delimiters
  const hasBareLatex = /\\(dfrac|frac|sqrt|pm|cdot|times|leq|geq|ne|approx|alpha|beta|pi|sum|int|infty|times|div)\b/.test(s) ||
                       /\^[0-9a-zA-Z{]/.test(s);

  if (hasBareLatex) {
    // If the entire string is basically a formula, wrap the whole string
    if (!s.includes('\n') && s.length < 120) {
      return `$${s.trim()}$`;
    }
  }

  return s;
}

/**
 * Fast inline math renderer for buttons, badges, table cells, and multiple-choice options.
 * Does not wrap output in block <p> or <div> tags.
 */
export function renderInlineMathSegments(text: string): React.ReactNode {
  if (!text) return null;

  let source = text.trim().replace(/\\frac\{/g, '\\dfrac{');
  
  // If no $ delimiters but has bare latex or power/fraction, wrap it
  if (!source.includes('$')) {
    if (/\\(dfrac|frac|sqrt|pm|cdot|times|alpha|beta|pi)\b/.test(source) || /\^[0-9a-zA-Z{]/.test(source)) {
      source = `$${source}$`;
    }
  }

  // If no math tokens at all, return plain text
  if (!source.includes('$')) {
    return source;
  }

  // Split text by $...$ (inline math) or $$...$$ (block math)
  const segments = source.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);

  return segments.map((seg, idx) => {
    if (!seg) return null;

    if (seg.startsWith('$$') && seg.endsWith('$$') && seg.length >= 4) {
      const math = seg.slice(2, -2).trim();
      try {
        const html = katex.renderToString(math, {
          displayMode: true,
          throwOnError: false,
          strict: false
        });
        return (
          <span 
            key={idx} 
            className="inline-block align-middle my-1" 
            dangerouslySetInnerHTML={{ __html: html }} 
          />
        );
      } catch {
        return <span key={idx}>{seg}</span>;
      }
    }

    if (seg.startsWith('$') && seg.endsWith('$') && seg.length >= 2) {
      const math = seg.slice(1, -1).trim();
      try {
        const html = katex.renderToString(math, {
          displayMode: false,
          throwOnError: false,
          strict: false
        });
        return (
          <span 
            key={idx} 
            className="inline-block align-middle mx-0.5" 
            dangerouslySetInnerHTML={{ __html: html }} 
          />
        );
      } catch {
        return <span key={idx}>{seg}</span>;
      }
    }

    return <span key={idx}>{seg}</span>;
  });
}

/**
 * Universal math and Markdown renderer for ProEdu.
 * - `inline={true}`: Renders as inline <span> without <p> wrapper (ideal for choice buttons, options, titles)
 * - `inline={false}`: Renders full Markdown with math blocks, paragraphs, and list formatting
 */
export const MathRenderer: React.FC<MathRendererProps> = ({
  content,
  inline = false,
  className = '',
  imageMap
}) => {
  if (!content) return null;

  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);
  const isRichHtml = useMemo(() => containsRichHtml(normalized), [normalized]);
  const sanitizedHtml = useMemo(
    () => (isRichHtml ? renderSanitizedHtmlWithMath(normalized, imageMap) : ''),
    [isRichHtml, normalized, imageMap]
  );

  if (inline) {
    if (isRichHtml) {
      return (
        <span
          className={`inline-math-container study-html-content study-html-inline ${className}`}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      );
    }
    return (
      <span className={`inline-math-container ${className}`}>
        {renderInlineMathSegments(normalized)}
      </span>
    );
  }

  if (isRichHtml) {
    return (
      <div
        className={`prose-math-content study-html-content ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <div className={`prose-math-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          // Custom paragraph to avoid extra margin when rendering simple single-line text
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">
              {children}
            </p>
          ),
          // Links open safely in new tab
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-brand-blue hover:underline font-semibold"
            >
              {children}
            </a>
          )
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
};

export default MathRenderer;
