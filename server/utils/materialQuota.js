/**
 * Pure helper utilities for material export quotas, billing-cycle period calculation,
 * visibility/access checks, watermarking, and SVG page count detection.
 */

export const MATERIAL_EXPORT_MONTHLY_LIMIT = 8;
export const MATERIAL_BILLING_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;
export const MATERIAL_GRACE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const VALID_MATERIAL_TYPES = new Set(['worksheet', 'summary', 'cheatsheet']);
export const VALID_MATERIAL_GRADES = new Set(['5', '7', '9', 'all']);

export function parseTimestampOrIsoMillis(val) {
  if (!val) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.getTime() : null;
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return val.seconds * 1000;
  }
  const ms = new Date(val).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function getPragueDateFormatted(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Computes the 30-day billing-cycle quota key & end timestamp for a user.
 * Anchors to subscriptionPeriodEnd when active (preventing calendar month-boundary exploits),
 * or rolls in 30-day windows from premiumSince / createdAt.
 */
export function computeMaterialQuotaPeriod(userDoc, nowMs = Date.now()) {
  const periodEndRaw = userDoc?.subscriptionPeriodEnd ?? userDoc?.subscriptionExpiresAt ?? null;
  const periodEndMs = parseTimestampOrIsoMillis(periodEndRaw);

  if (periodEndMs !== null && periodEndMs + MATERIAL_GRACE_WINDOW_MS >= nowMs) {
    const endDate = new Date(periodEndMs);
    return {
      periodKey: `cycle_${endDate.toISOString().slice(0, 10)}`,
      periodEndsAt: endDate.toISOString(),
    };
  }

  const anchorMs =
    parseTimestampOrIsoMillis(userDoc?.premiumSince) ??
    parseTimestampOrIsoMillis(userDoc?.createdAt) ??
    nowMs;

  const elapsed = Math.max(0, nowMs - anchorMs);
  const cycleIdx = Math.floor(elapsed / MATERIAL_BILLING_CYCLE_MS);
  const cycleStartMs = anchorMs + cycleIdx * MATERIAL_BILLING_CYCLE_MS;
  const cycleEndMs = cycleStartMs + MATERIAL_BILLING_CYCLE_MS;

  return {
    periodKey: `roll_${new Date(cycleStartMs).toISOString().slice(0, 10)}`,
    periodEndsAt: new Date(cycleEndMs).toISOString(),
  };
}

/**
 * Checks whether a user (or guest) is allowed to view a material online.
 */
export function canUserViewMaterial(user, mat) {
  if (!mat) return false;
  if (user?.role === 'teacher') return true;
  if (mat.hiddenFromLibrary === true) return false;
  if (mat.status && mat.status !== 'ready') return false;

  const hasPaidAccess = Boolean(
    user &&
      (user.role === 'premium' ||
        (user.role === 'course' && Array.isArray(user.enrolledCourseIds) && user.enrolledCourseIds.length > 0))
  );
  if (hasPaidAccess) return true;

  return mat.isFreeSample === true;
}

/**
 * Returns personalized footer watermark text for non-teacher users, or null for teachers.
 */
export function buildWatermarkText(user, date = new Date()) {
  if (user?.role === 'teacher') return null;
  const identity = user?.email || user?.uid || 'Host';
  return `ProEducator • ${identity} • ${getPragueDateFormatted(date)}`;
}

/**
 * Detects page count inside a composite SVG produced by convertFileToSvg.
 */
export function detectSvgPageCount(svgString) {
  if (typeof svgString !== 'string' || !svgString.trim()) return null;
  const matches = svgString.match(/id=["']pdf-page-\d+["']/gi);
  if (matches && matches.length > 0) {
    return Math.min(500, matches.length);
  }
  return /<svg[\s>]/i.test(svgString) ? 1 : null;
}

export function normalizeMaterialType(raw) {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return VALID_MATERIAL_TYPES.has(val) ? val : 'worksheet';
}

export function normalizeMaterialGrade(raw) {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return VALID_MATERIAL_GRADES.has(val) ? val : null;
}
