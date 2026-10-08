import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katex from 'katex';

export interface MathRendererProps {
  content?: string | null;
  inline?: boolean;
  className?: string;
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
  className = ''
}) => {
  if (!content) return null;

  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);

  if (inline) {
    return (
      <span className={`inline-math-container ${className}`}>
        {renderInlineMathSegments(normalized)}
      </span>
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
