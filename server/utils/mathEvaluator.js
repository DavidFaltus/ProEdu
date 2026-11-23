/**
 * Greatest Common Divisor (Největší společný dělitel - NSD)
 * Used to verify irreducible fraction form (základní tvar zlomku) required by CERMAT.
 *
 * 1:1 ESM JS port of src/utils/mathEvaluator.ts for server-side evaluation.
 */
const MAX_FRACTION_TERM_DIGITS = 15;
const MAX_FRACTION_EXPONENT = 30;
const MAX_NUMERIC_TOKEN_LENGTH = 64;
const STRICT_NUMBER_REGEX = /^-?\d+(?:\.\d+)?$/;

export function gcd(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0 && Number.isFinite(y)) {
    const t = y;
    y = x % y;
    x = t;
  }
  return Number.isFinite(x) ? x : 1;
}

/**
 * Normalizes mathematical answer string:
 * - strips whitespace
 * - converts decimal commas to dots (e.g. 1,5 -> 1.5)
 * - strips outer $ delimiters
 * - normalizes LaTeX \frac{a}{b} to a/b
 * - strips leading variable assignment like "x=" or "K="
 */
export function normalizeMathAnswer(raw) {
  if (typeof raw !== 'string' || !raw) return '';

  let s = raw.trim().toLowerCase();

  // Remove wrapping $ or $$
  s = s.replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '').trim();

  // Remove whitespace
  s = s.replace(/\s+/g, '');

  // Convert decimal comma to dot
  s = s.replace(/,/g, '.');

  // Convert \frac{a}{b} or \dfrac{a}{b} to a/b
  s = s.replace(/\\d?frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');

  // Remove redundant outer brackets: (1)/(2) -> 1/2
  s = s.replace(/^\(([^()]+)\)\/\(([^()]+)\)$/, '$1/$2');
  s = s.replace(/^\(([^()]+)\)$/, '$1');

  // Remove leading variable equality like "x=5" or "y=-2" if simple
  s = s.replace(/^[a-z]=[a-z]?/, '');

  return s;
}

function evalFractionTerm(term) {
  const clean = term.replace(/[\(\)\{\}]/g, '').trim();
  const powMatch = clean.match(/^(-?\d+)\^([0-9]+)$/);
  if (powMatch) {
    const baseDigits = powMatch[1].startsWith('-') ? powMatch[1].slice(1) : powMatch[1];
    const expDigits = powMatch[2];
    if (baseDigits.length > MAX_FRACTION_TERM_DIGITS || expDigits.length > MAX_FRACTION_TERM_DIGITS) {
      return NaN;
    }
    const base = parseInt(powMatch[1], 10);
    const exp = parseInt(expDigits, 10);
    if (!Number.isSafeInteger(base) || !Number.isSafeInteger(exp) || exp < 0 || exp > MAX_FRACTION_EXPONENT) {
      return NaN;
    }
    const result = Math.pow(base, exp);
    if (!Number.isFinite(result) || !Number.isSafeInteger(result)) {
      return NaN;
    }
    return result;
  }

  if (!/^-?\d+$/.test(clean)) {
    return NaN;
  }
  const digits = clean.startsWith('-') ? clean.slice(1) : clean;
  if (digits.length > MAX_FRACTION_TERM_DIGITS) {
    return NaN;
  }
  const value = parseInt(clean, 10);
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    return NaN;
  }
  return value;
}

function parseStrictNumber(normStr) {
  if (typeof normStr !== 'string' || !normStr || normStr.length > MAX_NUMERIC_TOKEN_LENGTH) {
    return NaN;
  }
  if (!STRICT_NUMBER_REGEX.test(normStr)) {
    return NaN;
  }
  const intPart = normStr.replace(/^-/, '').split('.')[0];
  if (intPart.length > MAX_FRACTION_TERM_DIGITS) {
    return NaN;
  }
  const value = Number(normStr);
  return Number.isFinite(value) ? value : NaN;
}

/**
 * Attempts to parse a fraction from a normalized string (supports numbers and powers like 1/2^5).
 */
export function parseFraction(str) {
  const norm = normalizeMathAnswer(str);
  if (!norm || norm.length > MAX_NUMERIC_TOKEN_LENGTH) return null;

  // Match simple integer fraction or fraction with powers: e.g. "3/4" or "1/2^5" or "2^3/5"
  const match = norm.match(/^(-?\d+(?:\^\{?[0-9]+\}?)?)\/(-?\d+(?:\^\{?[0-9]+\}?)?)$/);
  if (!match) return null;

  let num = evalFractionTerm(match[1]);
  let den = evalFractionTerm(match[2]);

  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den === 0) return null;

  // Move negative sign to numerator if denominator is negative
  if (den < 0) {
    num = -num;
    den = -den;
  }

  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0) return null;

  const value = num / den;
  if (!Number.isFinite(value)) return null;

  const divisor = gcd(num, den);
  const isSimplified = divisor === 1 && den > 0;

  return {
    numerator: num,
    denominator: den,
    value,
    isSimplified
  };
}

/**
 * Normalizes text answer while preserving letter case (for Czech language / grammar checks).
 * - strips outer whitespace
 * - collapses multiple spaces into a single space
 * - strips outer $ delimiters if any
 */
export function normalizeCaseSensitiveTextAnswer(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  return raw
    .trim()
    .replace(/^\$\$|\$\$$/g, '')
    .replace(/^\$|\$$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates student answer against teacher's expected answer.
 * Handles:
 * 1. Case-sensitive exact comparison when `options.caseSensitive` is true (e.g. Czech language)
 * 2. Exact string match (after case/comma/space normalization for Math)
 * 3. Alternative answers separated by ';' or '|'
 * 4. Numerical fraction vs decimal equivalence (e.g. 1/2 vs 0.5 vs 0,5)
 * 5. CERMAT irreducible fraction rule (e.g. 2/4 vs 1/2 gives specific feedback)
 */
export function evaluateStudentAnswer(studentInput, expectedAnswer, options = {}) {
  const expectedStr = typeof expectedAnswer === 'string' ? expectedAnswer : String(expectedAnswer ?? '');
  const studentStr = typeof studentInput === 'string' ? studentInput : String(studentInput ?? '');

  if (options?.caseSensitive) {
    const normStudentCase = normalizeCaseSensitiveTextAnswer(studentStr);
    if (!normStudentCase) {
      return { isCorrect: false, isExact: false, isSimplified: false };
    }

    const expectedVariantsCase = expectedStr
      .split(/[;|]/)
      .map((v) => normalizeCaseSensitiveTextAnswer(v))
      .filter(Boolean);

    for (const variant of expectedVariantsCase) {
      if (normStudentCase === variant) {
        return {
          isCorrect: true,
          isExact: true,
          isSimplified: true
        };
      }
    }

    return {
      isCorrect: false,
      isExact: false,
      isSimplified: false
    };
  }

  const normStudent = normalizeMathAnswer(studentStr);
  if (!normStudent) {
    return { isCorrect: false, isExact: false, isSimplified: false };
  }

  // Support multiple accepted variants separated by ; or |
  const expectedVariants = expectedStr
    .split(/[;|]/)
    .map((v) => v.trim())
    .filter(Boolean);

  for (const variant of expectedVariants) {
    const normExpected = normalizeMathAnswer(variant);

    // 1. Exact match after normalization
    if (normStudent === normExpected) {
      const studentFrac = parseFraction(normStudent);
      const isSimplified = studentFrac ? studentFrac.isSimplified : true;
      return {
        isCorrect: true,
        isExact: true,
        isSimplified
      };
    }

    // 2. Numerical fraction evaluation
    const studentFrac = parseFraction(normStudent);
    const expectedFrac = parseFraction(normExpected);

    // Both are fractions
    if (studentFrac && expectedFrac) {
      if (Math.abs(studentFrac.value - expectedFrac.value) < 1e-9) {
        if (!studentFrac.isSimplified) {
          const d = gcd(studentFrac.numerator, studentFrac.denominator) || 1;
          const simplifiedNum = studentFrac.numerator / d;
          const simplifiedDen = studentFrac.denominator / d;
          return {
            isCorrect: true,
            isExact: false,
            isSimplified: false,
            tutorFeedback: `Hodnota je správná, ale zkrať zlomek na základní tvar (${simplifiedNum}/${simplifiedDen}).`
          };
        }
        return {
          isCorrect: true,
          isExact: true,
          isSimplified: true
        };
      }
    }

    // One is fraction, one is decimal (or both strict numbers)
    const studentNum = studentFrac ? studentFrac.value : parseStrictNumber(normStudent);
    const expectedNum = expectedFrac ? expectedFrac.value : parseStrictNumber(normExpected);

    if (Number.isFinite(studentNum) && Number.isFinite(expectedNum)) {
      if (Math.abs(studentNum - expectedNum) < 1e-9) {
        if (expectedFrac && studentFrac && !studentFrac.isSimplified) {
          return {
            isCorrect: true,
            isExact: false,
            isSimplified: false,
            tutorFeedback: 'Hodnota je správná, ale zkrať zlomek na základní tvar.'
          };
        }
        return {
          isCorrect: true,
          isExact: false,
          isSimplified: true
        };
      }
    }
  }

  return {
    isCorrect: false,
    isExact: false,
    isSimplified: false
  };
}
