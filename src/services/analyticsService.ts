import { getAnalytics, isSupported, logEvent, setUserId, setUserProperties, Analytics } from 'firebase/analytics';
import { getPerformance, trace as createPerfTrace, FirebasePerformance } from 'firebase/performance';
import { app, isFirebaseEmulatorEnabled } from '../lib/firebase';

let analyticsInstance: Analytics | null = null;
let performanceInstance: FirebasePerformance | null = null;
let isInitialized = false;
let isPerformanceInitialized = false;
let isCurrentUserTeacher = false;

const PURCHASE_DEDUP_PREFIX = 'proedu_ga4_purchased_';
const CANONICAL_BASE_URL = 'https://www.proeducator.eu';

// Rozpoznání vývojového prostředí (localhost / dev)
export const isDevEnvironment = (): boolean => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

export interface RouteSeoConfig {
  title: string;
  description: string;
  canonicalPath: string;
  indexable: boolean;
}

// Přehledné názvy stránek, popisky, kanonické URL a pravidla indexace pro GA4 a Google Search Console
export const resolveRouteSeo = (pagePath: string): RouteSeoConfig => {
  const cleanPath = ((pagePath || '/').split('?')[0].split('#')[0]).replace(/\/+$/, '') || '/';

  if (cleanPath === '/' || cleanPath === '/student' || cleanPath === '/student/dashboard' || cleanPath === '/dashboard') {
    return {
      title: 'ProEdu | Příprava na přijímací zkoušky CERMAT z matematiky a češtiny',
      description: 'Interaktivní online příprava na přijímací zkoušky CERMAT na střední školy a víceletá gymnázia. Procvičování z matematiky a českého jazyka, studijní materiály a živé kurzy.',
      canonicalPath: '/',
      indexable: cleanPath === '/',
    };
  }
  if (cleanPath === '/practice') {
    return {
      title: 'Procvičování na přijímačky CERMAT (Matematika a Čeština) | ProEdu',
      description: 'Interaktivní procvičování všech témat k přijímacím zkouškám CERMAT z matematiky a českého jazyka s okamžitým vyhodnocením a vysvětlením.',
      canonicalPath: '/practice',
      indexable: true,
    };
  }
  if (cleanPath.startsWith('/practice/session/')) {
    return {
      title: 'Trénink úloh | ProEdu',
      description: 'Interaktivní trénink úloh k přijímacím zkouškám CERMAT.',
      canonicalPath: cleanPath,
      indexable: false,
    };
  }
  if (cleanPath === '/learning') {
    return {
      title: 'Studijní materiály a taháky k přijímačkám | ProEdu',
      description: 'Přehledné studijní materiály, taháky a vzorce z matematiky a českého jazyka pro přípravu na přijímací zkoušky na SŠ a gymnázia.',
      canonicalPath: '/learning',
      indexable: true,
    };
  }
  if (cleanPath.startsWith('/study/')) {
    return {
      title: 'Výuková teorie a kroky | ProEdu',
      description: 'Výuková teorie a postup řešení krok za krokem v aplikaci ProEdu.',
      canonicalPath: cleanPath,
      indexable: false,
    };
  }
  if (cleanPath === '/statistics' || cleanPath === '/statistiky') {
    return {
      title: 'Statistiky a pokrok | ProEdu',
      description: 'Sledování osobního pokroku, úspěšnosti a statistik procvičování.',
      canonicalPath: '/statistics',
      indexable: false,
    };
  }
  if (cleanPath === '/courses') {
    return {
      title: 'Přípravné kurzy na přijímací zkoušky CERMAT | ProEdu',
      description: 'Živé online přípravné kurzy z matematiky a českého jazyka na přijímací zkoušky CERMAT s lektorem, záznamy lekcí a studijními materiály.',
      canonicalPath: '/courses',
      indexable: true,
    };
  }
  if (cleanPath.startsWith('/courses/')) {
    return {
      title: 'Detail přípravného kurzu | ProEdu',
      description: 'Podrobnosti, sylabus a termíny živého přípravného kurzu na přijímací zkoušky CERMAT.',
      canonicalPath: cleanPath,
      indexable: true,
    };
  }
  if (cleanPath === '/contact') {
    return {
      title: 'Kontakt | ProEdu',
      description: 'Kontaktujte tým ProEdu, s.r.o. ohledně online přípravy na přijímací zkoušky, kurzů a individuálního doučování.',
      canonicalPath: '/contact',
      indexable: true,
    };
  }
  if (cleanPath === '/terms' || cleanPath === '/podminky') {
    return {
      title: 'Obchodní podmínky | ProEdu',
      description: 'Všeobecné obchodní podmínky online vzdělávací platformy ProEdu, s.r.o.',
      canonicalPath: '/terms',
      indexable: cleanPath === '/terms',
    };
  }
  if (cleanPath === '/gdpr' || cleanPath === '/privacy') {
    return {
      title: 'Zásady ochrany osobních údajů | ProEdu',
      description: 'Informace o zpracování a ochraně osobních údajů (GDPR) v aplikaci ProEdu.',
      canonicalPath: '/privacy',
      indexable: cleanPath === '/privacy',
    };
  }
  if (cleanPath === '/doprava-a-platba') {
    return {
      title: 'Doprava a platba | ProEdu',
      description: 'Informace o způsobech platby kartou online přes platební bránu Comgate a okamžitém zpřístupnění digitálního předplatného ProEducator Premium.',
      canonicalPath: '/doprava-a-platba',
      indexable: true,
    };
  }
  if (cleanPath === '/settings') {
    return {
      title: 'Nastavení účtu a předplatné | ProEdu',
      description: 'Správa uživatelského profilu a předplatného ProEducator Premium.',
      canonicalPath: '/settings',
      indexable: false,
    };
  }
  if (cleanPath === '/teacher') {
    return {
      title: 'Učitelský panel | ProEdu',
      description: 'Administrace výukového obsahu ProEdu.',
      canonicalPath: '/teacher',
      indexable: false,
    };
  }
  if (cleanPath === '/login') {
    return {
      title: 'Přihlášení a registrace | ProEdu',
      description: 'Přihlášení do vzdělávací aplikace ProEdu.',
      canonicalPath: '/login',
      indexable: false,
    };
  }
  if (cleanPath === '/reset-password') {
    return {
      title: 'Obnovení hesla | ProEdu',
      description: 'Nastavení nového hesla k účtu ProEdu.',
      canonicalPath: '/reset-password',
      indexable: false,
    };
  }
  if (cleanPath === '/payment/success' || cleanPath === '/payment/cancelled' || cleanPath === '/payment/pending') {
    const titleByPath =
      cleanPath === '/payment/success'
        ? 'Platba úspěšná | ProEdu'
        : cleanPath === '/payment/cancelled'
          ? 'Platba zrušena | ProEdu'
          : 'Stav platby | ProEdu';
    return {
      title: titleByPath,
      description: 'Výsledek platby předplatného ProEducator Premium.',
      canonicalPath: cleanPath,
      indexable: false,
    };
  }
  return {
    title: 'Stránka nenalezena (404) | ProEdu',
    description: 'Požadovaná stránka nebyla nalezena.',
    canonicalPath: cleanPath,
    indexable: false,
  };
};

export const resolvePageTitle = (pagePath: string): string => {
  return resolveRouteSeo(pagePath).title;
};

// Dynamická aktualizace <head> tagů pro Google Search Console (prevence Soft 404, duplicit z query parametrů a neindexovaných stavů)
export const updateSeoMeta = (config: Partial<RouteSeoConfig> & { title: string }) => {
  if (typeof document === 'undefined') return;

  document.title = config.title;

  const setMetaTag = (selector: string, attrName: 'name' | 'property', attrVal: string, content: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrVal);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  if (config.description) {
    setMetaTag('meta[name="description"]', 'name', 'description', config.description);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', config.description);
  }

  setMetaTag('meta[property="og:title"]', 'property', 'og:title', config.title);

  if (typeof config.indexable === 'boolean') {
    setMetaTag(
      'meta[name="robots"]',
      'name',
      'robots',
      config.indexable ? 'index, follow' : 'noindex, nofollow'
    );
  }

  if (config.canonicalPath) {
    const normalizedPath = config.canonicalPath.startsWith('/') ? config.canonicalPath : `/${config.canonicalPath}`;
    const fullCanonical = `${CANONICAL_BASE_URL}${normalizedPath}`;
    let linkEl = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!linkEl) {
      linkEl = document.createElement('link');
      linkEl.setAttribute('rel', 'canonical');
      document.head.appendChild(linkEl);
    }
    linkEl.setAttribute('href', fullCanonical);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', fullCanonical);
  }
};

/**
 * Nastaví konkrétní název otevřeného procvičování, výukového tématu nebo kurzu do <title> a pošle obohacený page_view do GA4,
 * aby bylo v Google Analytics 4 v přehledu "Stránky a obrazovky" ihned vidět přesné jméno každého procvičování nebo kurzu.
 */
export const setDynamicPageSeo = (params: {
  pagePath: string;
  pageTitle: string;
  description?: string;
  indexable?: boolean;
}) => {
  updateSeoMeta({
    title: params.pageTitle,
    description: params.description,
    canonicalPath: (params.pagePath || '/').split('?')[0],
    indexable: params.indexable ?? false,
  });
  dispatchEvent('page_view', {
    page_path: params.pagePath,
    page_title: params.pageTitle,
    page_location: typeof window !== 'undefined' ? window.location.href : '',
  });
};

// Inicializace Firebase Analytics (propojeno s Google Analytics 4)
export const initAnalytics = async (): Promise<Analytics | null> => {
  if (isInitialized) return analyticsInstance;
  isInitialized = true;

  if (typeof window === 'undefined') return null;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      if (import.meta.env.DEV) {
        console.log('✅ Firebase Analytics inicializováno (Measurement ID:', app.options.measurementId || 'default', ')');
      }
    } else if (import.meta.env.DEV) {
      console.warn('⚠️ Firebase Analytics není v tomto prostředí podporováno.');
    }
  } catch (error) {
    console.warn('⚠️ Chyba při inicializaci Firebase Analytics:', error);
  }

  return analyticsInstance;
};

// Inicializace Firebase Performance Monitoring (Core Web Vitals + Network + Custom Traces)
export const initPerformance = (): FirebasePerformance | null => {
  if (isPerformanceInitialized) return performanceInstance;
  isPerformanceInitialized = true;

  if (typeof window === 'undefined' || isFirebaseEmulatorEnabled) return null;

  try {
    performanceInstance = getPerformance(app);
    performanceInstance.dataCollectionEnabled = true;
    performanceInstance.instrumentationEnabled = true;
    if (import.meta.env.DEV) {
      console.log('⚡ Firebase Performance Monitoring inicializováno');
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('⚠️ Chyba při inicializaci Firebase Performance Monitoring:', error);
    }
  }

  return performanceInstance;
};

export interface PerfTraceHandle {
  stop: (extraAttributes?: Record<string, string>, metrics?: Record<string, number>) => void;
}

/**
 * Spustí vlastní měřenou stopu (Custom Trace) ve Firebase Performance Monitoring.
 */
export const startPerfTrace = (
  traceName: string,
  initialAttributes?: Record<string, string>
): PerfTraceHandle => {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let rawTrace: ReturnType<typeof createPerfTrace> | null = null;

  try {
    const perf = performanceInstance || initPerformance();
    if (perf) {
      rawTrace = createPerfTrace(perf, traceName);
      rawTrace.start();
      if (initialAttributes) {
        Object.entries(initialAttributes).slice(0, 5).forEach(([k, v]) => {
          if (k && v !== undefined && v !== null) {
            rawTrace?.putAttribute(k.slice(0, 40), String(v).slice(0, 100));
          }
        });
      }
    }
  } catch {
    rawTrace = null;
  }

  let stopped = false;
  return {
    stop: (extraAttributes?: Record<string, string>, metrics?: Record<string, number>) => {
      if (stopped) return;
      stopped = true;
      const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);

      if (isDevEnvironment()) {
        console.log(
          `%c[Perf Trace DEV]%c ${traceName} (${durationMs} ms)`,
          'background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
          'color: #6d28d9; font-weight: bold;',
          { ...(initialAttributes || {}), ...(extraAttributes || {}), ...(metrics || {}) }
        );
      }

      if (!rawTrace) return;
      try {
        if (extraAttributes) {
          Object.entries(extraAttributes).slice(0, 5).forEach(([k, v]) => {
            if (k && v !== undefined && v !== null) {
              rawTrace?.putAttribute(k.slice(0, 40), String(v).slice(0, 100));
            }
          });
        }
        if (metrics) {
          Object.entries(metrics).forEach(([k, val]) => {
            if (k && typeof val === 'number' && Number.isFinite(val)) {
              rawTrace?.putMetric(k.slice(0, 40), Math.round(val));
            }
          });
        }
        rawTrace.stop();
      } catch {
        // Ignorujeme chybu při ukončení trace, aby nikdy neovlivnila běh aplikace
      }
    },
  };
};

// Vnitřní pomocná metoda pro odeslání události do Firebase / GA4
const dispatchEvent = async (
  eventName: string,
  eventParams: Record<string, any> = {},
  options: { allowForTeacher?: boolean } = {}
) => {
  const isDev = isDevEnvironment();

  // Pokud je přihlášen učitel/admin, vynecháme studentské konverzní a výukové události, aby nezkreslovaly statistiky v GA4
  if (isCurrentUserTeacher && !options.allowForTeacher) {
    if (isDev) {
      console.log(
        `%c[Analytics SKIP: Teacher]%c ${eventName}`,
        'background: #64748b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
        'color: #475569;',
        eventParams
      );
    }
    return;
  }

  if (isDev) {
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
      const finalParams = isDev ? { ...eventParams, debug_mode: true } : eventParams;
      logEvent(analytics, eventName, finalParams);
    }
  } catch (error) {
    console.error(`[Analytics Error] Nepodařilo se zaznamenat událost ${eventName}:`, error);
  }
};

// ==========================================
// 1. UŽIVATELSKÉ VLASTNOSTI A IDENTIFIKACE (USER PROPERTIES)
// ==========================================
export const setAnalyticsUser = async (
  uid: string | null,
  properties?: {
    role?: 'guest' | 'student' | 'teacher' | 'premium' | 'course' | 'free' | string;
    isPremium?: boolean;
    isTeacher?: boolean;
    subscriptionStatus?: string;
    studentGrade?: string | null;
    acquisitionSource?: string | null;
  }
) => {
  const isDev = isDevEnvironment();
  const effectiveRole = properties?.role || (uid ? 'free' : 'guest');
  isCurrentUserTeacher = Boolean(properties?.isTeacher || effectiveRole === 'teacher');

  if (isDev) {
    console.log(
      `%c[Analytics DEV: User]%c UID: ${uid || 'anonym'}, role: ${effectiveRole}, isPremium: ${!!properties?.isPremium}, status: ${properties?.subscriptionStatus || 'inactive'}`,
      'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      'color: #1d4ed8; font-weight: bold;'
    );
  }

  try {
    const analytics = analyticsInstance || (await initAnalytics());
    if (analytics) {
      // Při odhlášení (uid === null) explicitně vymažeme userId v GA4
      setUserId(analytics, (uid || null) as string);

      setUserProperties(analytics, {
        user_role: effectiveRole,
        is_premium: properties?.isPremium ? 'true' : 'false',
        subscription_status: properties?.subscriptionStatus || 'inactive',
        student_grade: properties?.studentGrade ? String(properties.studentGrade).slice(0, 36) : 'unset',
        acquisition_source: properties?.acquisitionSource ? String(properties.acquisitionSource).slice(0, 36) : 'unset',
      });
    }
  } catch (error) {
    console.error('[Analytics Error] Chyba při nastavování uživatele:', error);
  }
};

// ==========================================
// 2. NAVIGACE A STRÁNKY
// ==========================================
export const trackPageView = (pagePath: string, pageTitle?: string) => {
  const routeSeo = resolveRouteSeo(pagePath);
  const resolvedTitle = pageTitle || routeSeo.title;
  updateSeoMeta({
    ...routeSeo,
    title: resolvedTitle,
  });
  dispatchEvent('page_view', {
    page_path: pagePath,
    page_title: resolvedTitle,
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
// 3. AUTENTIZACE A ONBOARDING
// ==========================================
export const trackAuthLogin = (method: 'password' | 'google') => {
  dispatchEvent('login', { method });
};

export const trackAuthSignUpInit = (method: 'password' | 'google') => {
  dispatchEvent('sign_up_init', { method });
};

export const trackAuthSignUpComplete = (method: 'password' | 'google') => {
  dispatchEvent('sign_up', { method });
};

export const trackAuthLogout = () => {
  dispatchEvent('logout');
};

export const trackPasswordResetRequest = () => {
  dispatchEvent('password_reset_request');
};

// ==========================================
// 4. PROCVIČOVÁNÍ A HLOUBKA STUDIA (VÝUKOVÝ TRYCHTÝŘ)
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
    // Standardní GA4 dimenze (dostupné v reportech ihned bez čekání na vlastní dimenze)
    content_type: params.subject,
    item_id: params.subtopicId,
    item_name: params.subtopicTitle,
    item_category: params.subject,
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

export const trackPracticeHintUsed = (params: {
  subtopicId: string;
  questionId?: string;
  questionIndex: number;
}) => {
  dispatchEvent('practice_hint_used', {
    subtopic_id: params.subtopicId,
    question_id: params.questionId || '',
    question_index: params.questionIndex + 1,
  });
};

export const trackPracticeSolutionRevealed = (params: {
  subtopicId: string;
  questionId?: string;
  questionIndex: number;
}) => {
  dispatchEvent('practice_solution_revealed', {
    subtopic_id: params.subtopicId,
    question_id: params.questionId || '',
    question_index: params.questionIndex + 1,
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
    content_type: params.subject,
    item_id: params.subtopicId,
    item_name: params.subtopicTitle,
    item_category: params.subject,
  });
};

export const trackPracticeAbandon = (params: {
  subtopicId: string;
  subtopicTitle?: string;
  subject?: string;
  answeredCount: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  durationSeconds: number;
}) => {
  if (params.totalQuestions <= 0) return;
  const completionRate = Math.round((params.answeredCount / params.totalQuestions) * 100);
  dispatchEvent('practice_session_abandon', {
    subtopic_id: params.subtopicId,
    subtopic_title: params.subtopicTitle || '',
    subject: params.subject || '',
    answered_count: params.answeredCount,
    total_questions: params.totalQuestions,
    last_question_index: params.currentQuestionIndex + 1,
    completion_percentage: completionRate,
    duration_seconds: params.durationSeconds,
  });
};

export const trackStudySessionStart = (params: {
  subtopicId: string;
  subtopicTitle: string;
  totalSteps: number;
  hasMaterial: boolean;
}) => {
  dispatchEvent('study_session_start', {
    subtopic_id: params.subtopicId,
    subtopic_title: params.subtopicTitle,
    total_steps: params.totalSteps,
    has_material: params.hasMaterial,
  });
};

export const trackStudyStepComplete = (params: {
  subtopicId: string;
  stepIndex: number;
  totalSteps: number;
}) => {
  dispatchEvent('study_step_complete', {
    subtopic_id: params.subtopicId,
    step_number: params.stepIndex + 1,
    total_steps: params.totalSteps,
  });
};

export const trackStudySessionComplete = (params: {
  subtopicId: string;
  subtopicTitle: string;
  completedStepsCount: number;
  totalSteps: number;
  durationSeconds: number;
}) => {
  if (params.durationSeconds < 3) return;
  dispatchEvent('study_session_complete', {
    subtopic_id: params.subtopicId,
    subtopic_title: params.subtopicTitle,
    completed_steps: params.completedStepsCount,
    total_steps: params.totalSteps,
    duration_seconds: params.durationSeconds,
  });
};

export const trackQuestionInquirySubmit = (params: {
  subtopicTitle: string;
  questionId: string;
  source: 'practice' | 'study';
}) => {
  dispatchEvent('question_inquiry_submit', {
    subtopic_title: params.subtopicTitle,
    question_id: params.questionId,
    source: params.source,
  });
};

// ==========================================
// 5. E-COMMERCE, PŘEDPLATNÉ, MONETIZACE A ŽOLÍKY
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

export const trackBeginCheckout = (params: {
  orderId: string;
  planId?: string;
  amount?: number;
  currency?: string;
  reusedExisting?: boolean;
  isSandbox?: boolean;
}) => {
  // Testovací/sandbox objednávky nezapočítáváme do e-commerce trychtýře v GA4
  if (params.isSandbox) return;
  const value = params.amount ?? 99;
  const currency = params.currency || 'CZK';
  const itemId = params.planId || 'premium-monthly';

  dispatchEvent('begin_checkout', {
    transaction_id: params.orderId,
    value,
    currency,
    reused_existing_order: Boolean(params.reusedExisting),
    items: [
      {
        item_id: itemId,
        item_name: 'ProEducator Premium (měsíční tarif)',
        price: value,
        quantity: 1,
      },
    ],
  });
};

export const trackPurchase = (params: {
  orderId: string;
  planId?: string;
  amount?: number;
  currency?: string;
  isSandbox?: boolean;
  transId?: string | null;
}) => {
  if (!params.orderId) return;
  // Vyloučíme testovací sandbox simulace z produkčních tržeb v GA4
  if (params.isSandbox || (params.transId && String(params.transId).startsWith('SANDBOX_'))) {
    return;
  }

  // Deduplikace podle orderId, aby obnovení stránky nikdy nezapočítalo tržbu 2×
  if (typeof window !== 'undefined') {
    try {
      const dedupKey = `${PURCHASE_DEDUP_PREFIX}${params.orderId}`;
      if (localStorage.getItem(dedupKey) === '1') {
        return;
      }
      localStorage.setItem(dedupKey, '1');
    } catch {
      // Ignore storage access errors
    }
  }

  const value = params.amount ?? 99;
  const currency = params.currency || 'CZK';
  const itemId = params.planId || 'premium-monthly';

  dispatchEvent('purchase', {
    transaction_id: params.orderId,
    value,
    currency,
    items: [
      {
        item_id: itemId,
        item_name: 'ProEducator Premium (měsíční tarif)',
        price: value,
        quantity: 1,
      },
    ],
  });
};

export const trackCheckoutCancelled = (params: {
  orderId?: string;
  source: 'gateway_return' | 'user_manual';
}) => {
  dispatchEvent('checkout_cancelled', {
    order_id: params.orderId || '',
    cancel_source: params.source,
  });
};

export const trackSubscriptionCancel = (params: {
  reason: string;
  immediate?: boolean;
}) => {
  dispatchEvent('subscription_cancel', {
    cancel_reason: params.reason,
    immediate: Boolean(params.immediate),
  });
};

export const trackSubscriptionReactivate = () => {
  dispatchEvent('subscription_reactivate');
};

export const trackSubscriptionCardUpdateStart = (context: 'past_due' | 'active') => {
  dispatchEvent('subscription_card_update_start', {
    subscription_context: context,
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

// ==========================================
// 6. RŮST, HERNÍ ZÓNA ŽOLÍKŮ, KALENDÁŘ A ZPĚTNÁ VAZBA
// ==========================================
export const trackSurveyComplete = (params: {
  answer: string;
  grade: string;
}) => {
  dispatchEvent('survey_complete', {
    acquisition_source: params.answer,
    student_grade: params.grade,
  });
};

export const trackReferralShare = (method: 'copy_link' = 'copy_link') => {
  dispatchEvent('share', {
    method,
    content_type: 'referral_link',
  });
};

export const trackReferralRedeem = (rewardJokers: number = 30) => {
  dispatchEvent('referral_redeem', {
    reward_jokers: rewardJokers,
  });
};

export const trackPracticeScheduleSave = (params: {
  itemsCount: number;
  daysCount: number;
  intervalMode: string;
  subject: string;
}) => {
  dispatchEvent('practice_schedule_save', {
    scheduled_items_count: params.itemsCount,
    scheduled_days_count: params.daysCount,
    interval_mode: params.intervalMode,
    subject: params.subject,
  });
};

export const trackBugReportSubmit = (params: {
  category: string;
  hasScreenshot: boolean;
}) => {
  dispatchEvent('bug_report_submit', {
    bug_category: params.category,
    has_screenshot: params.hasScreenshot,
  });
};
