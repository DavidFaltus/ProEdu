import { getAnalytics, isSupported, logEvent, setUserId, setUserProperties, Analytics } from 'firebase/analytics';
import { app } from '../lib/firebase';

let analyticsInstance: Analytics | null = null;
let isInitialized = false;

// Rozpoznání vývojového prostředí (localhost / dev)
export const isDevEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    import.meta.env.DEV ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.local')
  );
};

// Inicializace Firebase Analytics
export const initAnalytics = async (): Promise<Analytics | null> => {
  if (isInitialized) return analyticsInstance;
  isInitialized = true;

  if (typeof window === 'undefined') return null;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      console.log('✅ Firebase Analytics inicializováno (Measurement ID:', app.options.measurementId || 'default', ')');
    } else {
      console.warn('⚠️ Firebase Analytics není v tomto prostředí podporováno.');
    }
  } catch (error) {
    console.warn('⚠️ Chyba při inicializaci Firebase Analytics:', error);
  }

  return analyticsInstance;
};

// Vnitřní pomocná metoda pro odeslání události
const dispatchEvent = async (eventName: string, eventParams: Record<string, any> = {}) => {
  const isDev = isDevEnvironment();

  if (isDev) {
    // V dev prostředí logujeme do konzole pro přehled vývojáře
    console.log(
      `%c[Analytics DEV]%c ${eventName}`,
      'background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      'color: #047857; font-weight: bold;',
      eventParams
    );
  }

  try {
    const analytics = analyticsInstance || (await initAnalytics());
    if (analytics) {
      // V dev prostředí posíláme s debug_mode: true, aby se událost ihned zobrazila v Firebase Console -> DebugView
      const finalParams = isDev ? { ...eventParams, debug_mode: true } : eventParams;
      logEvent(analytics, eventName, finalParams);
    }
  } catch (error) {
    console.error(`[Analytics Error] Nepodařilo se zaznamenat událost ${eventName}:`, error);
  }
};

// ==========================================
// 1. UŽIVATELSKÉ VLASTNOSTI A IDENTIFIKACE
// ==========================================
export const setAnalyticsUser = async (
  uid: string | null,
  properties?: {
    role?: 'guest' | 'student' | 'teacher' | 'premium' | 'course' | string;
    isPremium?: boolean;
  }
) => {
  const isDev = isDevEnvironment();

  if (isDev) {
    console.log(
      `%c[Analytics DEV: User]%c UID: ${uid || 'anonym'}, role: ${properties?.role || 'guest'}, isPremium: ${!!properties?.isPremium}`,
      'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      'color: #1d4ed8; font-weight: bold;'
    );
  }

  try {
    const analytics = analyticsInstance || (await initAnalytics());
    if (analytics) {
      if (uid) {
        setUserId(analytics, uid);
      }
      if (properties) {
        setUserProperties(analytics, {
          user_role: properties.role || 'guest',
          is_premium: properties.isPremium ? 'true' : 'false',
        });
      }
    }
  } catch (error) {
    console.error('[Analytics Error] Chyba při nastavování uživatele:', error);
  }
};

// ==========================================
// 2. NAVIGACE A STRÁNKY
// ==========================================
export const trackPageView = (pagePath: string, pageTitle?: string) => {
  dispatchEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title,
    page_location: typeof window !== 'undefined' ? window.location.href : '',
  });
};

export const trackSectionClick = (
  sectionName: string,
  targetPath: string,
  metadata?: Record<string, any>
) => {
  dispatchEvent('section_click', {
    section_name: sectionName,
    target_path: targetPath,
    ...metadata,
  });
};

// ==========================================
// 3. PROCVIČOVÁNÍ (TRYCHTÝŘ)
// ==========================================
export const trackPracticeSubjectChange = (subject: string) => {
  dispatchEvent('practice_subject_change', {
    subject,
  });
};

export const trackPracticeStart = (params: {
  subtopicId: string;
  subtopicTitle: string;
  subject: string;
  questionCount?: number;
}) => {
  dispatchEvent('practice_session_start', {
    subtopic_id: params.subtopicId,
    subtopic_title: params.subtopicTitle,
    subject: params.subject,
    question_count: params.questionCount || 0,
  });
};

export const trackPracticeAnswer = (params: {
  subtopicId: string;
  questionId?: string;
  questionIndex: number;
  isCorrect: boolean;
  usedHint: boolean;
}) => {
  dispatchEvent('practice_answer_submit', {
    subtopic_id: params.subtopicId,
    question_id: params.questionId || '',
    question_index: params.questionIndex + 1,
    is_correct: params.isCorrect,
    used_hint: params.usedHint,
  });
};

export const trackPracticeComplete = (params: {
  subtopicId: string;
  subtopicTitle: string;
  subject: string;
  totalQuestions: number;
  correctCount: number;
  scorePercentage: number;
  durationSeconds?: number;
}) => {
  dispatchEvent('practice_session_complete', {
    subtopic_id: params.subtopicId,
    subtopic_title: params.subtopicTitle,
    subject: params.subject,
    total_questions: params.totalQuestions,
    correct_count: params.correctCount,
    score_percentage: Math.round(params.scorePercentage),
    duration_seconds: params.durationSeconds || 0,
  });
};

// ==========================================
// 4. KONVERZE, MONETIZACE A ŽOLÍKY
// ==========================================
export const trackPaywallImpression = (trigger: string, context?: Record<string, any>) => {
  dispatchEvent('paywall_impression', {
    trigger_source: trigger,
    ...context,
  });
};

export const trackPaywallCtaClick = (action: string, plan?: string) => {
  dispatchEvent('paywall_cta_click', {
    action,
    plan: plan || 'unspecified',
  });
};

export const trackRewardedVideoStart = (rewardType: string = 'joker') => {
  dispatchEvent('rewarded_video_start', {
    reward_type: rewardType,
  });
};

export const trackRewardedVideoComplete = (rewardType: string = 'joker') => {
  dispatchEvent('rewarded_video_complete', {
    reward_type: rewardType,
  });
};

export const trackJokerConsumed = (remainingJokers: number) => {
  dispatchEvent('joker_consumed', {
    remaining_jokers: remainingJokers,
  });
};

export const trackJokersExhausted = () => {
  dispatchEvent('jokers_exhausted');
};
