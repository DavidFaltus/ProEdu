/**
 * Utilities for Live Lessons in ProEdu:
 * - Local session tracking for joined lessons
 * - Audio notification chime via Web Audio API
 */

const JOINED_LESSONS_STORAGE_KEY = 'proedu_joined_lessons';

/**
 * Retrieves the list of lesson IDs the user has clicked to join in the current browser session.
 */
export function getJoinedLessonIds(): string[] {
  try {
    const raw = sessionStorage.getItem(JOINED_LESSONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Checks whether the user has joined a specific lesson.
 */
export function isLessonJoined(lessonId: string): boolean {
  return getJoinedLessonIds().includes(lessonId);
}

/**
 * Marks a lesson as joined in sessionStorage and notifies any active listeners via CustomEvent.
 */
export function markLessonAsJoined(lessonId: string): void {
  try {
    const ids = getJoinedLessonIds();
    if (!ids.includes(lessonId)) {
      ids.push(lessonId);
      sessionStorage.setItem(JOINED_LESSONS_STORAGE_KEY, JSON.stringify(ids));
      window.dispatchEvent(new CustomEvent('proedu-lesson-joined', { detail: { lessonId } }));
    }
  } catch {
    // Graceful fallback if storage is restricted
  }
}

/**
 * Plays a pleasant 2-tone chime using Web Audio API to alert the student about a live lesson.
 * Does not require external audio files or network requests.
 */
export function playLessonNotificationSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // First bell tone (E5: ~659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second higher tone (B5: ~987.77 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.15);
    gain2.gain.setValueAtTime(0.18, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch {
    // Silently ignore browser autoplay restrictions
  }
}
