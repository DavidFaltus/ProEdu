import { test } from 'node:test';
import assert from 'node:assert/strict';

interface TestProfile {
  uid: string;
  role: 'student' | 'free' | 'premium' | 'course' | 'teacher';
  courseId?: string | null;
  enrolledCourseIds?: string[];
  subscriptionStatus?: string;
  subscriptionPeriodEnd?: string;
}

function computeCourseAccessState(profile: TestProfile | null) {
  const isTeacher = profile?.role === 'teacher';

  const enrolledCourseIds: string[] = [];
  if (profile?.enrolledCourseIds && Array.isArray(profile.enrolledCourseIds)) {
    enrolledCourseIds.push(...profile.enrolledCourseIds.filter(id => typeof id === 'string' && id.trim().length > 0));
  }
  if (profile?.courseId && !enrolledCourseIds.includes(profile.courseId)) {
    enrolledCourseIds.push(profile.courseId);
  }

  const isCancelledExpired = Boolean(
    profile?.role === 'premium' &&
    profile?.subscriptionStatus === 'cancelled_at_period_end' &&
    profile?.subscriptionPeriodEnd &&
    !isNaN(new Date(profile.subscriptionPeriodEnd).getTime()) &&
    Date.now() > new Date(profile.subscriptionPeriodEnd).getTime()
  );

  const isCourseUser = isTeacher || enrolledCourseIds.length > 0 || profile?.role === 'course';
  const isPremium = !isCancelledExpired && (profile?.role === 'premium' || isCourseUser || isTeacher);

  const hasCourseAccess = (courseId: string | undefined): boolean => {
    if (!courseId) return false;
    if (isTeacher) return true;
    return enrolledCourseIds.includes(courseId);
  };

  return {
    isTeacher,
    isCourseUser,
    isPremium,
    enrolledCourseIds,
    hasCourseAccess
  };
}

test('Premium subscriber WITHOUT enrolled courses has NO access to courses', () => {
  const premiumStudent: TestProfile = {
    uid: 'student_premium_1',
    role: 'premium',
    subscriptionStatus: 'active'
  };

  const state = computeCourseAccessState(premiumStudent);
  assert.equal(state.isPremium, true, 'Student should have active Premium status');
  assert.equal(state.hasCourseAccess('course-math'), false, 'Premium student must NOT have access to Math course without enrollment');
  assert.equal(state.hasCourseAccess('course-czech'), false, 'Premium student must NOT have access to Czech course without enrollment');
  assert.equal(state.hasCourseAccess('course-combo'), false, 'Premium student must NOT have access to Combo course without enrollment');
});

test('Student enrolled in Course A (Math) has access ONLY to Math, NOT to Czech or Combo', () => {
  const mathStudent: TestProfile = {
    uid: 'student_math_1',
    role: 'course',
    enrolledCourseIds: ['course-math'],
    courseId: 'course-math'
  };

  const state = computeCourseAccessState(mathStudent);
  assert.equal(state.hasCourseAccess('course-math'), true, 'Enrolled student must have access to Math course');
  assert.equal(state.hasCourseAccess('course-czech'), false, 'Enrolled student must NOT have access to Czech course');
  assert.equal(state.hasCourseAccess('course-combo'), false, 'Enrolled student must NOT have access to Combo course');
  // Student se zapsaným kurzem má v ceně kurzu i všechny Premium funkce (neomezené procvičování)
  assert.equal(state.isPremium, true, 'Course student gets premium app benefits');
  assert.equal(state.isCourseUser, true);
});

test('Combo course is a standalone course and does NOT automatically grant access to standalone Math/Czech courses', () => {
  const comboStudent: TestProfile = {
    uid: 'student_combo_1',
    role: 'course',
    enrolledCourseIds: ['course-combo'],
    courseId: 'course-combo'
  };

  const state = computeCourseAccessState(comboStudent);
  assert.equal(state.hasCourseAccess('course-combo'), true, 'Access granted to Combo course');
  assert.equal(state.hasCourseAccess('course-math'), false, 'Access denied to standalone Math course');
  assert.equal(state.hasCourseAccess('course-czech'), false, 'Access denied to standalone Czech course');
});

test('Teacher has access to all courses unconditionally', () => {
  const teacher: TestProfile = {
    uid: 'teacher_1',
    role: 'teacher'
  };

  const state = computeCourseAccessState(teacher);
  assert.equal(state.isTeacher, true);
  assert.equal(state.hasCourseAccess('course-math'), true);
  assert.equal(state.hasCourseAccess('course-czech'), true);
  assert.equal(state.hasCourseAccess('course-combo'), true);
  assert.equal(state.hasCourseAccess('non-existent-or-custom-course'), true);
});

test('Removing all courses reverts role to free when not paying premium', () => {
  let studentRole: string = 'course';
  let accessCourseIds: string[] = ['course-math'];

  // Simulace odškrtnutí všech kurzů lektorem v administraci
  const handleToggleCourse = (courseId: string) => {
    const exists = accessCourseIds.includes(courseId);
    accessCourseIds = exists ? accessCourseIds.filter(id => id !== courseId) : [...accessCourseIds, courseId];
    if (!exists && accessCourseIds.length > 0) {
      studentRole = 'course';
    } else if (accessCourseIds.length === 0 && studentRole === 'course') {
      studentRole = 'free';
    }
  };

  handleToggleCourse('course-math'); // Odškrtneme kurz
  assert.equal(accessCourseIds.length, 0);
  assert.equal(studentRole, 'free', 'Role must revert to free when all courses are unassigned');
});
