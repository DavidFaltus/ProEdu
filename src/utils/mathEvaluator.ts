/**
 * Greatest Common Divisor (Největší společný dělitel - NSD)
 * Used to verify irreducible fraction form (základní tvar zlomku) required by CERMAT.
 */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export interface ParsedFraction {
  numerator: number;
  denominator: number;
  value: number;
  isSimplified: boolean;
}

/**
 * Normalizes mathematical answer string:
 * - strips whitespace
 * - converts decimal commas to dots (e.g. 1,5 -> 1.5)
 * - strips outer $ delimiters
 * - normalizes LaTeX \frac{a}{b} to a/b
 * - strips leading variable assignment like "x=" or "K="
 */
export function normalizeMathAnswer(raw: string): string {
  if (!raw) return '';

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

function evalFractionTerm(term: string): number {
  const clean = term.replace(/[\(\)\{\}]/g, '').trim();
  const powMatch = clean.match(/^(-?\d+)\^([0-9]+)$/);
  if (powMatch) {
    const base = parseInt(powMatch[1], 10);
    const exp = parseInt(powMatch[2], 10);
    return Math.pow(base, exp);
  }
  return parseInt(clean, 10);
}

/**
 * Attempts to parse a fraction from a normalized string (supports numbers and powers like 1/2^5).
 */
export function parseFraction(str: string): ParsedFraction | null {
  const norm = normalizeMathAnswer(str);

  // Match simple integer fraction or fraction with powers: e.g. "3/4" or "1/2^5" or "2^3/5"
  const match = norm.match(/^(-?\d+(?:\^\{?[0-9]+\}?)?)\/(-?\d+(?:\^\{?[0-9]+\}?)?)$/);
  if (!match) return null;

  let num = evalFractionTerm(match[1]);
  let den = evalFractionTerm(match[2]);

  if (isNaN(num) || isNaN(den) || den === 0) return null;

  // Move negative sign to numerator if denominator is negative
  if (den < 0) {
    num = -num;
    den = -den;
  }

  const divisor = gcd(num, den);
  const isSimplified = divisor === 1 && den > 0;

  return {
    numerator: num,
    denominator: den,
    value: num / den,
    isSimplified
  };
}

export interface AnswerEvaluationResult {
  isCorrect: boolean;
  isExact: boolean;
  isSimplified: boolean;
  tutorFeedback?: string;
}

/**
 * Evaluates student answer against teacher's expected answer.
 * Handles:
 * 1. Exact string match (after case/comma/space normalization)
 * 2. Alternative answers separated by ';' or '|'
 * 3. Numerical fraction vs decimal equivalence (e.g. 1/2 vs 0.5 vs 0,5)
 * 4. CERMAT irreducible fraction rule (e.g. 2/4 vs 1/2 gives specific feedback)
 */
export function evaluateStudentAnswer(
  studentInput: string,
  expectedAnswer: string
): AnswerEvaluationResult {
  const normStudent = normalizeMathAnswer(studentInput);
  if (!normStudent) {
    return { isCorrect: false, isExact: false, isSimplified: false };
  }

  // Support multiple accepted variants separated by ; or |
  const expectedVariants = expectedAnswer
    .split(/[;|]/)
    .map(v => v.trim())
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
          const simplifiedNum = studentFrac.numerator / gcd(studentFrac.numerator, studentFrac.denominator);
          const simplifiedDen = studentFrac.denominator / gcd(studentFrac.numerator, studentFrac.denominator);
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

    // One is fraction, one is decimal
    const studentNum = studentFrac ? studentFrac.value : parseFloat(normStudent);
    const expectedNum = expectedFrac ? expectedFrac.value : parseFloat(normExpected);

    if (!isNaN(studentNum) && !isNaN(expectedNum)) {
      if (Math.abs(studentNum - expectedNum) < 1e-9) {
        // If teacher wanted a fraction in simplest form and student gave decimal or unreduced fraction
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
