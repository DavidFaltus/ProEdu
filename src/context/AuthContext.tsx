import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithEmailAndPassword, 
  signInWithCustomToken,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile as updateAuthProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { cacheManager } from '../lib/cacheManager';
import { UserProfile, UserRole } from '../types';
import { 
  checkAndResetDailyJokers, 
  consumeJoker, 
  rewardVideoJokers, 
  recordPracticeStreak,
  calculateMaxJokersCap,
  claimReferralCodeApi,
  submitSurveyAnswerApi,
  consumePendingVideoToken,
  BASE_JOKER_CAP, 
  DEFAULT_DAILY_JOKERS, 
} from '../services/jokerService';
import { 
  setAnalyticsUser, 
  trackJokerConsumed, 
  trackJokersExhausted, 
  trackRewardedVideoComplete 
} from '../services/analyticsService';
import { toast } from 'sonner';

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

const CLIENT_WRITABLE_PROFILE_FIELDS = new Set([
  'name',
  'photoURL',
  'avatarEmoji',
  'avatarBgColor',
  'preferredPaymentMethod',
  'billingDetails',
  'lastViewedActivityAt',
  'focusAreas',
]);

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  isCourseUser: boolean;
  enrolledCourseIds: string[];
  hasCourseAccess: (courseId: string | undefined) => boolean;
  jokers: number;
  streak: number;
  maxJokersCap: number;
  isProfileSettingsOpen: boolean;
  setIsProfileSettingsOpen: (open: boolean) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  openAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  initRegistration: (email: string, pass: string, name: string, confirmPassword?: string) => Promise<{ success: boolean; simulated?: boolean; message?: string }>;
  resendRegistrationOtp: (email: string) => Promise<{ success: boolean; simulated?: boolean; message?: string }>;
  confirmRegistration: (email: string, code: string) => Promise<{ success: boolean; message?: string }>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  consumeOneJoker: () => Promise<boolean>;
  claimVideoReward: (videoToken?: string) => Promise<{ success: boolean; reachedCap?: boolean; newJokers?: number; added?: number; cap?: number; limitReached?: boolean; error?: string }>;
  claimReferralReward: (code: string) => Promise<{ success: boolean; reward: number; referrerName: string }>;
  submitSurvey: (answer: string, customAnswer: string | undefined, school: string, grade: string) => Promise<{ success: boolean; reward: number }>;
  recordPracticeSessionStreak: () => Promise<{ streakIncreased: boolean; newStreak: number }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  isTeacher: false,
  isAdmin: false,
  isPremium: false,
  isCourseUser: false,
  enrolledCourseIds: [],
  hasCourseAccess: () => false,
  jokers: BASE_JOKER_CAP,
  streak: 0,
  maxJokersCap: BASE_JOKER_CAP,
  isProfileSettingsOpen: false,
  setIsProfileSettingsOpen: () => {},
  isAuthModalOpen: false,
  setIsAuthModalOpen: () => {},
  openAuthModal: () => {},
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  resetPassword: async () => {},
  initRegistration: async () => ({ success: false }),
  resendRegistrationOtp: async () => ({ success: false }),
  confirmRegistration: async () => ({ success: false }),
  signOut: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  updateProfileData: async () => {},
  updateUserPassword: async () => {},
  consumeOneJoker: async () => true,
  claimVideoReward: async () => ({ success: false, cap: BASE_JOKER_CAP }),
  claimReferralReward: async () => ({ success: false, reward: 0, referrerName: '' }),
  submitSurvey: async () => ({ success: false, reward: 0 }),
  recordPracticeSessionStreak: async () => ({ streakIncreased: false, newStreak: 0 }),
});

const isLoopbackHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

const isDevToolbarAllowed = (): boolean => {
  return Boolean(
    import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_DEV_TOOLBAR === 'true' &&
    isLoopbackHost()
  );
};

const getDevRoleOverride = (): UserRole | null => {
  if (typeof window === 'undefined') return null;
  if (!isDevToolbarAllowed()) return null;
  try {
    const val = localStorage.getItem('proedu_dev_role_override') as UserRole | null;
    if (val && ['free', 'student', 'premium', 'course', 'teacher'].includes(val)) {
      return val;
    }
  } catch {
    return null;
  }
  return null;
};

const CACHED_PROFILE_KEY = 'proedu_cached_profile';

const clearSessionStorageKeys = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHED_PROFILE_KEY);
    localStorage.removeItem('proedu_dev_mode');
    localStorage.removeItem('proedu_dev_role_override');
    localStorage.removeItem('proedu_pending_referral');
    localStorage.removeItem('proedu_last_viewed_activity');
    localStorage.removeItem('proedu_joined_lessons');

    for (const store of [localStorage, sessionStorage]) {
      const keysToDelete: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith('proedu_') && key !== 'proedu_guest_monetization') {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((k) => store.removeItem(k));
    }
  } catch (e) {
    console.warn('Failed to clear session storage keys:', e);
  }
};

function toFirestoreTimestamp(value: any): Timestamp {
  if (value instanceof Timestamp) return value;
  if (value && typeof value.seconds === 'number') {
    return new Timestamp(value.seconds, value.nanoseconds || 0);
  }
  if (value && typeof value._seconds === 'number') {
    return new Timestamp(value._seconds, value._nanoseconds || 0);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return Timestamp.fromDate(d);
    }
  }
  return Timestamp.now();
}

function getEffectivePeriodEnd(profile: Partial<UserProfile> | null | undefined): string | null {
  if (!profile) return null;
  return profile.subscriptionPeriodEnd || (profile as any).subscriptionExpiresAt || null;
}

function isSubscriptionPeriodExpired(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile || profile.role !== 'premium') return false;
  if (profile.subscriptionStatus === 'inactive' || profile.subscriptionStatus === 'expired') {
    return true;
  }

  const rawEnd = getEffectivePeriodEnd(profile);
  if (!rawEnd) return false;
  const endMs = new Date(rawEnd).getTime();
  if (isNaN(endMs)) return false;

  if (profile.subscriptionStatus === 'cancelled_at_period_end') {
    return Date.now() > endMs;
  }

  if (profile.subscriptionStatus === 'active') {
    return Date.now() > endMs + GRACE_PERIOD_MS;
  }

  return false;
}

function normalizeUserProfile(raw: Partial<UserProfile>, authUser: User): UserProfile {
  const validRoles: UserRole[] = ['free', 'student', 'premium', 'course', 'teacher'];
  const role: UserRole = raw.role && validRoles.includes(raw.role) ? raw.role : 'free';
  const periodEnd = getEffectivePeriodEnd(raw);

  return {
    ...raw,
    uid: raw.uid || authUser.uid,
    email: raw.email || authUser.email || '',
    name: raw.name || authUser.displayName || 'Uživatel',
    role,
    jokers: typeof raw.jokers === 'number' ? raw.jokers : 0,
    streak: typeof raw.streak === 'number' ? raw.streak : 0,
    dailyVideosWatched: typeof raw.dailyVideosWatched === 'number' ? raw.dailyVideosWatched : 0,
    enrolledCourseIds: Array.isArray(raw.enrolledCourseIds)
      ? raw.enrolledCourseIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [],
    subscriptionPeriodEnd: periodEnd ?? undefined,
    createdAt: toFirestoreTimestamp(raw.createdAt),
  } as UserProfile;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => auth.currentUser || null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [claimRole, setClaimRole] = useState<UserRole | null>(null);
  const [claimCourseIds, setClaimCourseIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openAuthModal = () => setIsAuthModalOpen(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!isDevToolbarAllowed()) {
        try {
          localStorage.removeItem('proedu_dev_mode');
          localStorage.removeItem('proedu_dev_role_override');
        } catch {
          // Ignore storage errors
        }
      }
      try {
        const params = new URLSearchParams(window.location.search);
        const refParam = params.get('ref');
        if (refParam && refParam.trim()) {
          localStorage.setItem('proedu_pending_referral', refParam.trim());
        }
      } catch (err) {
        console.warn('Chyba při čtení referral parametru:', err);
      }
    }
  }, []);

  const syncUserProfile = useCallback(async (authUser: User, isCancelledRef?: { current: boolean }) => {
    let rawProfile: UserProfile | null = null;
    let idToken = await authUser.getIdToken();
    let claimsWereUpdated = false;

    try {
      const res = await fetch('/api/auth/session-bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.claimsUpdated === true) {
          claimsWereUpdated = true;
          idToken = await authUser.getIdToken(true);
        }
        if (data?.profile && typeof data.profile === 'object') {
          rawProfile = normalizeUserProfile(data.profile, authUser);
        }
      }
    } catch (bootstrapErr) {
      console.warn('Session bootstrap request warning:', bootstrapErr);
    }

    const tokenResult = await authUser.getIdTokenResult(claimsWereUpdated).catch(() => null);
    let verifiedClaimRole = (tokenResult?.claims?.role as UserRole | undefined) || null;
    const verifiedClaimCourses = Array.isArray(tokenResult?.claims?.enrolledCourseIds)
      ? (tokenResult!.claims.enrolledCourseIds as unknown[]).filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        )
      : null;

    if (!isCancelledRef?.current) {
      setClaimRole(verifiedClaimRole);
      setClaimCourseIds(verifiedClaimCourses);
    }

    if (!rawProfile) {
      try {
        const docRef = doc(db, 'users', authUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          rawProfile = normalizeUserProfile(docSnap.data() as Partial<UserProfile>, authUser);
          if (verifiedClaimRole && ['free', 'student', 'premium', 'course', 'teacher'].includes(verifiedClaimRole)) {
            rawProfile.role = verifiedClaimRole;
          }
          if (verifiedClaimCourses) {
            rawProfile.enrolledCourseIds = verifiedClaimCourses;
          }
        }
      } catch (docErr) {
        console.warn('Fallback Firestore user read warning:', docErr);
      }
    }

    if (!rawProfile) {
      rawProfile = normalizeUserProfile(
        {
          uid: authUser.uid,
          email: authUser.email || '',
          name: authUser.displayName || 'Nový uživatel',
          role: verifiedClaimRole || 'free',
          jokers: 0,
          streak: 0,
          enrolledCourseIds: verifiedClaimCourses || [],
        },
        authUser
      );
    }

    if (isCancelledRef?.current) return;

    // Nejprve respektujeme případnou expiraci předplatného před kontrolou denních žolíků
    let effectiveProfile = rawProfile;
    const hasEnrolledCourses =
      (effectiveProfile.enrolledCourseIds && effectiveProfile.enrolledCourseIds.length > 0) ||
      Boolean(effectiveProfile.courseId);

    if (isSubscriptionPeriodExpired(effectiveProfile)) {
      const targetRole: UserRole = hasEnrolledCourses ? 'course' : 'free';
      effectiveProfile = {
        ...effectiveProfile,
        role: targetRole,
        subscriptionStatus: 'inactive',
      };
      try {
        const expiryRes = await fetch('/api/subscription/check-expiry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
        });
        if (expiryRes.ok) {
          idToken = await authUser.getIdToken(true);
          const refreshedResult = await authUser.getIdTokenResult(true).catch(() => null);
          verifiedClaimRole = (refreshedResult?.claims?.role as UserRole | undefined) || targetRole;
          if (!isCancelledRef?.current) {
            setClaimRole(verifiedClaimRole);
          }
        }
      } catch (expErr) {
        console.warn('Subscription check-expiry sync warning:', expErr);
      }
    } else if (effectiveProfile.role === 'course' && !hasEnrolledCourses) {
      effectiveProfile = {
        ...effectiveProfile,
        role: 'free',
      };
    }

    const effectiveHasUnlimited =
      effectiveProfile.role === 'teacher' ||
      hasEnrolledCourses ||
      effectiveProfile.role === 'premium';

    if (!effectiveHasUnlimited) {
      try {
        effectiveProfile = await checkAndResetDailyJokers(effectiveProfile);
      } catch (jokerErr) {
        console.warn('checkAndResetDailyJokers warning:', jokerErr);
      }
    }

    const devOverride = getDevRoleOverride();
    if (devOverride) {
      effectiveProfile = {
        ...effectiveProfile,
        role: devOverride,
      };
    }

    if (!isCancelledRef?.current) {
      setProfile(effectiveProfile);
    }

    if (typeof window !== 'undefined' && !effectiveProfile.referredBy) {
      const pendingRef = localStorage.getItem('proedu_pending_referral');
      if (pendingRef) {
        try {
          const claimRes = await claimReferralCodeApi(pendingRef, idToken);
          if (claimRes.success) {
            effectiveProfile = {
              ...effectiveProfile,
              jokers: claimRes.newJokers,
              referredBy: pendingRef,
            };
            if (!isCancelledRef?.current) {
              setProfile(effectiveProfile);
            }
            localStorage.removeItem('proedu_pending_referral');
            toast.success(`Uplatněn bonus za doporučení od ${claimRes.referrerName}! +${claimRes.reward} žolíků připsáno.`);
          }
        } catch (claimErr) {
          console.warn('Auto referral claim info:', claimErr);
          localStorage.removeItem('proedu_pending_referral');
        }
      }
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      if (cancelledRef.current) return;
      setUser(authUser);

      try {
        if (authUser) {
          await syncUserProfile(authUser, cancelledRef);
        } else {
          setClaimRole(null);
          setClaimCourseIds(null);
          const devOverride = getDevRoleOverride();
          if (devOverride && isDevToolbarAllowed()) {
            if (!cancelledRef.current) {
              setProfile({
                uid: 'guest-preview',
                email: 'host@proedu.cz',
                name: `Host (${devOverride.toUpperCase()})`,
                role: devOverride,
                jokers: BASE_JOKER_CAP,
                streak: 0,
                createdAt: Timestamp.now(),
              });
            }
          } else {
            if (!cancelledRef.current) {
              setProfile(null);
              clearSessionStorageKeys();
            }
          }
        }
      } catch (err) {
        console.error('Unhandled auth state change error:', err);
        if (!cancelledRef.current) {
          setProfile(null);
        }
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
          setIsAuthReady(true);
        }
      }
    });

    return () => {
      cancelledRef.current = true;
      unsubscribeAuth();
    };
  }, [syncUserProfile]);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    await syncUserProfile(auth.currentUser);
  }, [syncUserProfile]);

  const devOverrideActive = getDevRoleOverride();
  const effectiveRole: UserRole | undefined =
    devOverrideActive ?? (profile?.role || claimRole || undefined);

  const enrolledCourseIds = React.useMemo(() => {
    const list: string[] = [];
    const addId = (id: unknown) => {
      if (typeof id === 'string' && id.trim().length > 0 && !list.includes(id)) {
        list.push(id);
      }
    };
    if (Array.isArray(profile?.enrolledCourseIds)) {
      profile.enrolledCourseIds.forEach(addId);
    }
    if (profile?.courseId) {
      addId(profile.courseId);
    }
    if (Array.isArray(claimCourseIds)) {
      claimCourseIds.forEach(addId);
    }
    return list;
  }, [profile?.enrolledCourseIds, profile?.courseId, claimCourseIds]);

  const isCancelledExpired = Boolean(
    effectiveRole === 'premium' &&
    profile?.subscriptionStatus === 'cancelled_at_period_end' &&
    isSubscriptionPeriodExpired(profile)
  );

  const isSubscriptionExpired = Boolean(
    effectiveRole === 'premium' &&
    isSubscriptionPeriodExpired(profile)
  );

  const isTeacher = Boolean(
    (user && (effectiveRole === 'teacher' || (!devOverrideActive && claimRole === 'teacher'))) ||
    (!user && isDevToolbarAllowed() && devOverrideActive === 'teacher')
  );
  const isAdmin = isTeacher;

  const isCourseUser = Boolean(
    isTeacher ||
    enrolledCourseIds.length > 0 ||
    (isDevToolbarAllowed() && devOverrideActive === 'course')
  );

  const hasActivePaidPremium = Boolean(
    effectiveRole === 'premium' &&
    !isSubscriptionExpired &&
    !isCancelledExpired
  );

  const isPremium = Boolean(
    (user || (isDevToolbarAllowed() && Boolean(devOverrideActive))) &&
    (isTeacher || isCourseUser || hasActivePaidPremium)
  );

  const hasCourseAccess = React.useCallback((courseId: string | undefined): boolean => {
    if (!courseId) return false;
    if (isTeacher) return true;
    return enrolledCourseIds.includes(courseId);
  }, [isTeacher, enrolledCourseIds]);

  // Synchronizace uživatelských vlastností a role do Google Analytics
  useEffect(() => {
    if (isAuthReady) {
      setAnalyticsUser(user ? user.uid : null, {
        role: isSubscriptionExpired ? (enrolledCourseIds.length > 0 ? 'course' : 'free') : (effectiveRole || 'guest'),
        isPremium,
      });
    }
  }, [user?.uid, effectiveRole, isSubscriptionExpired, isPremium, enrolledCourseIds.length, isAuthReady]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const parseSafeJsonResponse = async (res: Response, defaultError: string) => {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Ověřovací služba je dočasně nedostupná, zkuste to prosím za okamžik.');
    }
    try {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || defaultError);
      }
      return data;
    } catch (err: any) {
      if (err.message && !err.message.includes('JSON')) {
        throw err;
      }
      throw new Error('Ověřovací služba je dočasně nedostupná, zkuste to prosím za okamžik.');
    }
  };

  const initRegistration = async (email: string, pass: string, name: string, confirmPassword?: string) => {
    let res: Response;
    try {
      res = await fetch('/api/auth/register-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, confirmPassword, name })
      });
    } catch {
      throw new Error('Ověřovací služba je dočasně nedostupná, zkuste to prosím za okamžik.');
    }
    return await parseSafeJsonResponse(res, 'Nepodařilo se zahájit registraci.');
  };

  const resendRegistrationOtp = async (email: string) => {
    let res: Response;
    try {
      res = await fetch('/api/auth/register-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    } catch {
      throw new Error('Ověřovací služba je dočasně nedostupná, zkuste to prosím za okamžik.');
    }
    return await parseSafeJsonResponse(res, 'Nepodařilo se znovu odeslat kód.');
  };

  const confirmRegistration = async (email: string, code: string) => {
    let res: Response;
    try {
      res = await fetch('/api/auth/register-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
    } catch {
      throw new Error('Ověřovací služba je dočasně nedostupná, zkuste to prosím za okamžik.');
    }
    const data = await parseSafeJsonResponse(res, 'Nepodařilo se ověřit kód.');
    if (data.customToken) {
      await signInWithCustomToken(auth, data.customToken);
    } else if (data.tempPassword) {
      await signInWithEmailAndPassword(auth, email, data.tempPassword);
    }
    return data;
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    await initRegistration(email, pass, name);
  };

  const resetPassword = async (email: string) => {
    const trimmed = (email || '').trim();
    if (!trimmed) {
      throw new Error('Zadej prosím platnou e-mailovou adresu.');
    }
    const actionCodeSettings = typeof window !== 'undefined' && window.location?.origin ? {
      url: `${window.location.origin}/login`,
      handleCodeInApp: false,
    } : undefined;

    await sendPasswordResetEmail(auth, trimmed, actionCodeSettings);
  };

  const signOut = async () => {
    clearSessionStorageKeys();
    cacheManager.clear();
    setClaimRole(null);
    setClaimCourseIds(null);
    setProfile(null);
    await firebaseSignOut(auth);
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) {
      throw new Error('Pro úpravu profilu se musíte přihlásit.');
    }

    const safeData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (CLIENT_WRITABLE_PROFILE_FIELDS.has(key) && value !== undefined) {
        safeData[key] = value;
      }
    }

    if (Object.keys(safeData).length === 0) {
      return;
    }

    const docRef = doc(db, 'users', user.uid);
    await updateDoc(docRef, safeData);

    // Also update Firebase Auth profile if name or non-base64 photoURL changed
    if (safeData.name || safeData.photoURL) {
      const authUpdates: Record<string, string> = {};
      if (safeData.name) authUpdates.displayName = safeData.name;
      if (safeData.photoURL && !String(safeData.photoURL).startsWith('data:')) {
        authUpdates.photoURL = safeData.photoURL;
      }
      if (Object.keys(authUpdates).length > 0) {
        try {
          await updateAuthProfile(user, authUpdates);
        } catch (e) {
          console.warn('updateAuthProfile warning:', e);
        }
      }
    }

    setProfile(prev => (prev ? { ...prev, ...safeData } : null));
  };

  const jokers = user ? (profile?.jokers ?? 0) : BASE_JOKER_CAP;
  const streak = profile?.streak ?? 0;
  const maxJokersCap = calculateMaxJokersCap(streak);

  const consumeOneJoker = async (): Promise<boolean> => {
    if (!profile) return false;
    if (isPremium) return true;
    const res = await consumeJoker(profile);
    if (res.success) {
      setProfile(prev => (prev ? { ...prev, jokers: res.remainingJokers } : null));
      trackJokerConsumed(res.remainingJokers);
      if (res.remainingJokers <= 0) {
        trackJokersExhausted();
      }
    }
    return res.success;
  };

  const claimVideoReward = async (
    videoToken?: string
  ): Promise<{ success: boolean; reachedCap?: boolean; newJokers?: number; added?: number; cap?: number; limitReached?: boolean; error?: string }> => {
    if (!profile || !user) {
      return { success: false, cap: maxJokersCap, error: 'Pro připsání žolíků se musíte přihlásit.' };
    }
    const resolvedToken = videoToken ?? consumePendingVideoToken() ?? undefined;
    const res = await rewardVideoJokers(profile, resolvedToken);
    if (res.success) {
      setProfile(prev =>
        prev
          ? {
              ...prev,
              jokers: res.newJokers,
              dailyVideosWatched: res.dailyVideosWatched ?? (prev.dailyVideosWatched ?? 0) + 1,
            }
          : null
      );
      trackRewardedVideoComplete('joker');
      toast.success(`Získáno +${res.added} žolíků! Stav: ${res.newJokers}/${res.cap}`);
    } else if (res.limitReached) {
      toast.info('Dnes jsi již vyčerpal limit 3 odměňovacích videí. Další budou k dispozici zítra!');
    } else if (res.reachedCap) {
      toast.info(`Máš již plnou kapacitu (${res.newJokers}/${res.cap} žolíků). Pro další dobití si nejdříve procvič pár otázek!`);
    } else if (res.error) {
      toast.error(res.error);
    }
    return res;
  };

  const claimReferralReward = async (code: string): Promise<{ success: boolean; reward: number; referrerName: string }> => {
    if (!user) {
      toast.error('Pro uplatnění kódu musíte být přihlášeni.');
      return { success: false, reward: 0, referrerName: '' };
    }
    try {
      const token = await user.getIdToken();
      const res = await claimReferralCodeApi(code, token);
      if (res.success) {
        setProfile(prev =>
          prev
            ? {
                ...prev,
                jokers: res.newJokers,
                referredBy: code,
              }
            : null
        );
        toast.success(`Skvělé! Získal jsi +${res.reward} bonusových žolíků za doporučení od ${res.referrerName}!`);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('proedu_pending_referral');
        }
      }
      return res;
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se uplatnit kód doporučení.');
      return { success: false, reward: 0, referrerName: '' };
    }
  };

  const submitSurvey = async (
    answer: string,
    customAnswer: string | undefined,
    school: string,
    grade: string
  ): Promise<{ success: boolean; reward: number }> => {
    if (!user) {
      toast.error('Pro odeslání dotazníku musíte být přihlášeni.');
      return { success: false, reward: 0 };
    }
    try {
      const token = await user.getIdToken();
      const res = await submitSurveyAnswerApi(answer, customAnswer, school, grade, token);

      setProfile(prev =>
        prev
          ? {
              ...prev,
              jokers: typeof res.newJokers === 'number' ? res.newJokers : prev.jokers,
              surveyCompleted: true,
              surveyAnswer: answer,
              surveyAnswerCustom: customAnswer,
              surveySchool: school,
              surveyGrade: grade,
            }
          : null
      );
      toast.success(`Děkujeme za zpětnou vazbu! +${res.reward} bonusových žolíků bylo připsáno.`);
      return res;
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se odeslat dotazník.');
      return { success: false, reward: 0 };
    }
  };

  const recordPracticeSessionStreak = async (): Promise<{ streakIncreased: boolean; newStreak: number }> => {
    if (!profile || !user) return { streakIncreased: false, newStreak: 0 };
    const res = await recordPracticeStreak(profile);
    if (res.streakIncreased) {
      setProfile(res.updatedProfile);
      if (res.newStreak === 10) {
        toast.success('🔥 Gratulujeme k 10dennímu streaku! Tvoje denní kapacita žolíků se trvale navýšila na 15!');
      } else {
        toast.success(`🔥 Streak prodloužen na ${res.newStreak} ${res.newStreak === 1 ? 'den' : res.newStreak < 5 ? 'dny' : 'dní'}!`);
      }
    }
    return { streakIncreased: res.streakIncreased, newStreak: res.newStreak };
  };

  const updateUserPassword = async (newPassword: string) => {
    if (!user) return;
    await updatePassword(user, newPassword);
  };

  const contextValue = React.useMemo(() => ({ 
    user, 
    profile, 
    loading, 
    isAuthReady, 
    isTeacher,
    isAdmin,
    isPremium,
    isCourseUser,
    enrolledCourseIds,
    hasCourseAccess,
    jokers,
    streak,
    maxJokersCap,
    isProfileSettingsOpen,
    setIsProfileSettingsOpen,
    isAuthModalOpen,
    setIsAuthModalOpen,
    openAuthModal,
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithEmail, 
    resetPassword,
    initRegistration,
    resendRegistrationOtp,
    confirmRegistration,
    signOut,
    logout: signOut,
    refreshProfile,
    updateProfileData,
    updateUserPassword,
    consumeOneJoker,
    claimVideoReward,
    claimReferralReward,
    submitSurvey,
    recordPracticeSessionStreak,
  }), [
    user, 
    profile, 
    loading, 
    isAuthReady, 
    isTeacher,
    isAdmin,
    isPremium, 
    isCourseUser, 
    enrolledCourseIds,
    hasCourseAccess,
    jokers, 
    streak,
    maxJokersCap,
    isProfileSettingsOpen, 
    isAuthModalOpen,
    refreshProfile,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
