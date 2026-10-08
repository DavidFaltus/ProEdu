import katex from 'katex';

/**
 * Validates LaTeX syntax using KaTeX compiler.
 * Detects unclosed delimiters, mismatched braces, or invalid math tokens.
 */
export function validateLatexSyntax(text: string): { isValid: boolean; error?: string } {
  if (!text) return { isValid: true };

  // Check for mismatched/unclosed single or double dollar delimiters
  const cleanEscaped = text.replace(/\\\$/g, '');
  const dollarCount = (cleanEscaped.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    return {
      isValid: false,
      error: 'V textu je lichý počet znaků $ (neuzavřený matematický vzorec).'
    };
  }

  // Extract all inline and block formulas
  const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^\$]+?)\$/g;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    const mathExpression = (match[1] || match[2] || '').trim();
    if (!mathExpression) continue;

    try {
      katex.renderToString(mathExpression, {
        throwOnError: true,
        strict: false
      });
    } catch (err: any) {
      return {
        isValid: false,
        error: `Chyba v matematickém vzorci "${mathExpression}": ${err?.message || 'Neplatná syntaxe'}`
      };
    }
  }

  return { isValid: true };
}

/**
 * Transforms Unicode math characters (superscripts, fractions, symbols) to LaTeX.
 */
export function normalizeUnicodeMath(text: string): string {
  if (!text) return '';

  return text
    // Superscripts
    .replace(/²/g, '^{2}')
    .replace(/³/g, '^{3}')
    .replace(/⁴/g, '^{4}')
    .replace(/⁵/g, '^{5}')
    .replace(/⁶/g, '^{6}')
    .replace(/⁷/g, '^{7}')
    .replace(/⁸/g, '^{8}')
    .replace(/⁹/g, '^{9}')
    .replace(/⁰/g, '^{0}')
    .replace(/⁺/g, '^{+}')
    .replace(/⁻/g, '^{-}')
    // Vulgar fractions
    .replace(/½/g, '\\dfrac{1}{2}')
    .replace(/⅓/g, '\\dfrac{1}{3}')
    .replace(/¼/g, '\\dfrac{1}{4}')
    .replace(/¾/g, '\\dfrac{3}{4}')
    .replace(/⅕/g, '\\dfrac{1}{5}')
    .replace(/⅙/g, '\\dfrac{1}{6}')
    .replace(/⅛/g, '\\dfrac{1}{8}')
    // Math symbols
    .replace(/±/g, '\\pm ')
    .replace(/∓/g, '\\mp ')
    .replace(/·/g, '\\cdot ')
    .replace(/×/g, '\\cdot ')
    .replace(/≠/g, '\\neq ')
    .replace(/≤/g, '\\leq ')
    .replace(/≥/g, '\\geq ')
    .replace(/≈/g, '\\approx ')
    .replace(/°/g, '^\\circ ')
    .replace(/∞/g, '\\infty ');
}

/**
 * Cleans formula text for storage/display.
 * Automatic text recognition heuristics have been removed per specification,
 * as users provide explicit KaTeX notations (e.g. $\frac{a}{\frac{a}{b}} = x$).
 */
export function preprocessMathText(text: string): string {
  if (!text) return '';

  let result = text.trim();

  // Strip leading Excel formula apostrophe/equals if present
  if (result.startsWith("'=")) {
    result = result.substring(1);
  }

  return result;
}
