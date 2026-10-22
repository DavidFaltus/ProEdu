import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateEmail,
  updatePassword,
  updateProfile as updateAuthProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { 
  checkAndResetDailyJokers, 
  consumeJoker, 
  rewardVideoJokers, 
  recordPracticeStreak,
  calculateMaxJokersCap,
  claimReferralCodeApi,
  submitSurveyAnswerApi,
  BASE_JOKER_CAP, 
  DEFAULT_DAILY_JOKERS, 
  getTodayDateString 
} from '../services/jokerService';
import { 
  setAnalyticsUser, 
  trackJokerConsumed, 
  trackJokersExhausted, 
  trackRewardedVideoComplete 
} from '../services/analyticsService';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  isTeacher: boolean;
  isPremium: boolean;
  isCourseUser: boolean;
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
  signOut: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  consumeOneJoker: () => Promise<boolean>;
  claimVideoReward: () => Promise<{ success: boolean; reachedCap?: boolean; newJokers?: number; added?: number }>;
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
  isPremium: false,
  isCourseUser: false,
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
  signOut: async () => {},
  updateProfileData: async () => {},
  updateUserPassword: async () => {},
  consumeOneJoker: async () => true,
  claimVideoReward: async () => ({ success: false, cap: BASE_JOKER_CAP }),
  claimReferralReward: async () => ({ success: false, reward: 0, referrerName: '' }),
  submitSurvey: async () => ({ success: false, reward: 0 }),
  recordPracticeSessionStreak: async () => ({ streakIncreased: false, newStreak: 0 }),
});

const checkIsDevModeActive = (): boolean => {
  if (typeof window === 'undefined') return Boolean(import.meta.env.DEV);
  return Boolean(
    import.meta.env.DEV || 
    localStorage.getItem('proedu_dev_mode') === 'true'
  );
};

const getDevRoleOverride = (): UserRole | null => {
  if (typeof window === 'undefined') return null;
  if (!checkIsDevModeActive()) return null;
  return (localStorage.getItem('proedu_dev_role_override') as UserRole) || null;
};

const CACHED_PROFILE_KEY = 'proedu_cached_profile';

const getCachedProfile = (): UserProfile | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHED_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.uid && parsed.uid !== 'guest-preview' && parsed.role) {
      if (parsed.createdAt && typeof parsed.createdAt.seconds === 'number') {
        parsed.createdAt = new Timestamp(parsed.createdAt.seconds, parsed.createdAt.nanoseconds || 0);
      } else {
        parsed.createdAt = Timestamp.now();
      }
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse cached profile:', e);
  }
  return null;
};

const setCachedProfile = (profile: UserProfile | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!profile || profile.uid === 'guest-preview') {
      localStorage.removeItem(CACHED_PROFILE_KEY);
    } else {
      localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
    }
  } catch (e) {
    console.warn('Failed to save profile cache:', e);
  }
};

const clearCachedProfile = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHED_PROFILE_KEY);
  } catch (e) {
    console.warn('Failed to clear profile cache:', e);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialCachedProfile = React.useMemo(() => getCachedProfile(), []);
  const [user, setUser] = useState<User | null>(() => auth.currentUser || null);
  const [profile, setProfile] = useState<UserProfile | null>(initialCachedProfile);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const setProfileAndCache = (value: React.SetStateAction<UserProfile | null>) => {
    setProfile(prev => {
      const next = typeof value === 'function' ? (value as (prev: UserProfile | null) => UserProfile | null)(prev) : value;
      if (next && next.uid !== 'guest-preview') {
        setCachedProfile(next);
      } else if (!next) {
        clearCachedProfile();
      }
      return next;
    });
  };

  const openAuthModal = () => setIsAuthModalOpen(true);

  // Zachycení referral parametru z URL při příchodu na web
  useEffect(() => {
    if (typeof window !== 'undefined') {
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

  useEffect(() => {
    let isCancelled = false;

    const syncUserProfile = async (authUser: User) => {
      const docRef = doc(db, 'users', authUser.uid);
      let docSnap;
      try {
        docSnap = await getDoc(docRef);
      } catch (fetchErr: any) {
        console.warn('Initial profile getDoc warning (trying fallback to cache):', fetchErr);
        const cached = getCachedProfile();
        if (cached && cached.uid === authUser.uid) {
          if (!isCancelled) {
            setProfileAndCache(cached);
          }
          // Tichý retry po 3 sekundách na pozadí
          setTimeout(() => {
            if (!isCancelled && auth.currentUser) {
              syncUserProfile(auth.currentUser).catch(console.warn);
            }
          }, 3000);
          return;
        }
        throw fetchErr;
      }

      if (isCancelled) return;

      if (docSnap && docSnap.exists()) {
        const rawProfile = docSnap.data() as UserProfile;
        let freshProfile: UserProfile;
        try {
          freshProfile = await checkAndResetDailyJokers(rawProfile);
        } catch (jokerErr) {
          console.warn('checkAndResetDailyJokers error, using raw profile:', jokerErr);
          freshProfile = rawProfile;
        }

        // Zajistit, aby každý existující profil měl vygenerovaný referral kód
        if (!freshProfile.referralCode) {
          const code = authUser.uid.slice(0, 8).toUpperCase();
          freshProfile.referralCode = code;
          updateDoc(docRef, { referralCode: code }).catch(console.warn);
        }

        const override = getDevRoleOverride();
        if (override) {
          freshProfile.role = override;
        }

        if (!isCancelled) {
          setProfileAndCache(freshProfile);
        }

        // Pokud nově přihlášený uživatel přišel přes referral odkaz a ještě ho nemá uplatněný
        if (typeof window !== 'undefined' && !freshProfile.referredBy) {
          const pendingRef = localStorage.getItem('proedu_pending_referral');
          if (pendingRef) {
            try {
              const token = await authUser.getIdToken();
              const res = await claimReferralCodeApi(pendingRef, token);
              if (res.success) {
                freshProfile.jokers = res.newJokers;
                freshProfile.referredBy = pendingRef;
                if (!isCancelled) {
                  setProfileAndCache({ ...freshProfile });
                }
                localStorage.removeItem('proedu_pending_referral');
                toast.success(`Uplatněn bonus za doporučení od ${res.referrerName}! +${res.reward} žolíků připsáno.`);
              }
            } catch (claimErr) {
              console.warn('Auto referral claim info:', claimErr);
              localStorage.removeItem('proedu_pending_referral');
            }
          }
        }
      } else {
        // Rule 4: Role never derived from email in frontend.
        // Rule 16: Least privilege - default to free.
        const today = getTodayDateString();
        const refCode = authUser.uid.slice(0, 8).toUpperCase();
        const newProfile: UserProfile = {
          uid: authUser.uid,
          email: authUser.email || '',
          name: authUser.displayName || 'Nový uživatel',
          role: 'free',
          jokers: BASE_JOKER_CAP,
          streak: 0,
          referralCode: refCode,
          referralsCount: 0,
          lastDailyGrantDate: today,
          lastJokerResetDate: today,
          dailyVideosWatched: 0,
          createdAt: Timestamp.now(),
        };
        const override = getDevRoleOverride();
        if (override) {
          newProfile.role = override;
        }
        try {
          await setDoc(docRef, newProfile);
        } catch (setDocErr) {
          console.warn('setDoc user profile error:', setDocErr);
        }
        if (!isCancelled) {
          setProfileAndCache(newProfile);
        }

        // Automatické uplatnění referral odkazu pro nového uživatele
        if (typeof window !== 'undefined') {
          const pendingRef = localStorage.getItem('proedu_pending_referral');
          if (pendingRef) {
            try {
              const token = await authUser.getIdToken();
              const res = await claimReferralCodeApi(pendingRef, token);
              if (res.success) {
                newProfile.jokers = res.newJokers;
                newProfile.referredBy = pendingRef;
                if (!isCancelled) {
                  setProfileAndCache({ ...newProfile });
                }
                localStorage.removeItem('proedu_pending_referral');
                toast.success(`Uplatněn bonus za doporučení od ${res.referrerName}! +${res.reward} žolíků připsáno.`);
              }
            } catch (claimErr) {
              console.warn('Auto referral claim info:', claimErr);
              localStorage.removeItem('proedu_pending_referral');
            }
          }
        }
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      if (isCancelled) return;
      setUser(authUser);

      try {
        if (authUser) {
          await syncUserProfile(authUser);
        } else {
          const override = getDevRoleOverride();
          if (override) {
            if (!isCancelled) {
              setProfile({
                uid: 'guest-preview',
                email: 'host@proedu.cz',
                name: `Host (${override.toUpperCase()})`,
                role: override,
                jokers: BASE_JOKER_CAP,
                streak: 0,
                createdAt: Timestamp.now(),
              });
            }
          } else {
            if (!isCancelled) {
              setProfile(null);
              clearCachedProfile();
            }
          }
        }
      } catch (err) {
        console.error('Unhandled auth state change error:', err);
        if (authUser) {
          const cached = getCachedProfile();
          if (cached && cached.uid === authUser.uid && !isCancelled) {
            setProfileAndCache(cached);
          }
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setIsAuthReady(true);
        }
      }
    });

    return () => {
      isCancelled = true;
      unsubscribeAuth();
    };
  }, []);

  // Synchronizace uživatelských vlastností a role do Google Analytics
  useEffect(() => {
    if (isAuthReady) {
      setAnalyticsUser(user ? user.uid : null, {
        role: profile?.role || 'guest',
        isPremium: profile?.role === 'premium' || profile?.role === 'course' || profile?.role === 'teacher',
      });
    }
  }, [user?.uid, profile?.role, isAuthReady]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, pass);
    const docRef = doc(db, 'users', user.uid);
    const today = getTodayDateString();
    const refCode = user.uid.slice(0, 8).toUpperCase();
    const newProfile: UserProfile = {
      uid: user.uid,
      email: email,
      name: name,
      role: 'student',
      jokers: BASE_JOKER_CAP,
      streak: 0,
      referralCode: refCode,
      referralsCount: 0,
      lastDailyGrantDate: today,
      lastJokerResetDate: today,
      dailyVideosWatched: 0,
      createdAt: Timestamp.now(),
    };
    await setDoc(docRef, newProfile);
    setProfileAndCache(newProfile);

    // Automatické uplatnění referral odkazu pro nového uživatele
    if (typeof window !== 'undefined') {
      const pendingRef = localStorage.getItem('proedu_pending_referral');
      if (pendingRef) {
        try {
          const token = await user.getIdToken();
          const res = await claimReferralCodeApi(pendingRef, token);
          if (res.success) {
            newProfile.jokers = res.newJokers;
            newProfile.referredBy = pendingRef;
            setProfileAndCache({ ...newProfile });
            localStorage.removeItem('proedu_pending_referral');
            toast.success(`Uplatněn bonus za doporučení od ${res.referrerName}! +${res.reward} žolíků připsáno.`);
          }
        } catch (claimErr) {
          console.warn('Auto referral claim info:', claimErr);
          localStorage.removeItem('proedu_pending_referral');
        }
      }
    }
  };

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('proedu_dev_role_override');
      clearCachedProfile();
    }
    await firebaseSignOut(auth);
    setProfile(null);
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    // V dev režimu nebo pro učitele umožnit změnu role pro testování
    const isDevModeActive = checkIsDevModeActive();
    const canChangeRole = isDevModeActive || profile?.role === 'teacher';

    const { uid, createdAt, role, ...rest } = data as any;
    const safeData: any = { ...rest };
    if (canChangeRole && role) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('proedu_dev_role_override', role);
      }
      // V dev režimu synchronizujeme změnu role do Firestore přes serverový backend, aby prošla pravidla v databázi
      if (isDevModeActive && user?.uid) {
        try {
          await fetch('/api/dev/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: user.uid, role })
          });
        } catch (apiErr) {
          console.warn('Backend dev set-role sync failed:', apiErr);
        }
      } else if (profile?.role === 'teacher') {
        safeData.role = role;
      }
    }

    if (!user) {
      if (safeData.role) {
        setProfile(prev => prev ? { ...prev, ...safeData } : {
          uid: 'guest-preview',
          email: 'host@proedu.cz',
          name: `Host (${safeData.role.toUpperCase()})`,
          role: safeData.role,
          jokers: DEFAULT_DAILY_JOKERS,
          createdAt: Timestamp.now(),
        });
      }
      return;
    }

    const docRef = doc(db, 'users', user.uid);
    if (Object.keys(safeData).length > 0) {
      try {
        await updateDoc(docRef, safeData);
      } catch (err: any) {
        console.warn('Firestore updateDoc note (falling back to local dev state):', err);
        // Pokud Firestore odmítne roli v dev módu, necháme proběhnout lokální změnu v aplikaci bez chyby
        if (!isDevModeActive && profile?.role !== 'teacher') throw err;
      }
    }
    
    // Also update Auth profile if name or photoURL is changed
    if (safeData.name || safeData.photoURL) {
      const authUpdates: any = {};
      if (safeData.name) authUpdates.displayName = safeData.name;
      
      // ONLY update Auth photoURL if it's NOT a base64 (because Auth has strict length limits)
      // We rely on Firestore profile for the actual photo
      if (safeData.photoURL && !safeData.photoURL.startsWith('data:')) {
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

    setProfileAndCache(prev => prev ? { ...prev, ...safeData } : null);
  };

  const isTeacher = profile?.role === 'teacher';
  const isPremium = profile?.role === 'premium' || profile?.role === 'course' || profile?.role === 'teacher';
  const isCourseUser = profile?.role === 'course' || profile?.role === 'teacher';
  const jokers = profile?.jokers ?? BASE_JOKER_CAP;
  const streak = profile?.streak ?? 0;
  const maxJokersCap = calculateMaxJokersCap(streak);

  const consumeOneJoker = async (): Promise<boolean> => {
    if (!profile) return false;
    if (isPremium) return true;
    const res = await consumeJoker(profile);
    if (res.success) {
      setProfileAndCache(prev => prev ? { ...prev, jokers: res.remainingJokers } : null);
      trackJokerConsumed(res.remainingJokers);
      if (res.remainingJokers <= 0) {
        trackJokersExhausted();
      }
    }
    return res.success;
  };

  const claimVideoReward = async (): Promise<{ success: boolean; reachedCap?: boolean; newJokers?: number; added?: number; cap: number }> => {
    if (!profile) return { success: false, cap: maxJokersCap };
    const res = await rewardVideoJokers(profile);
    if (res.success) {
      setProfileAndCache(prev => prev ? {
        ...prev,
        jokers: res.newJokers,
        dailyVideosWatched: (prev.dailyVideosWatched || 0) + 1,
      } : null);
      trackRewardedVideoComplete('joker');
      toast.success(`Získáno +${res.added} žolíků! Stav: ${res.newJokers}/${res.cap}`);
    } else if (res.reachedCap) {
      toast.info(`Máš již plnou kapacitu (${profile.jokers}/${res.cap} žolíků). Pro další dobití si nejdříve procvič pár otázek!`);
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
        setProfileAndCache(prev => prev ? {
          ...prev,
          jokers: res.newJokers,
          referredBy: code,
        } : null);
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
      let res: { success: boolean; reward: number; newJokers: number };
      try {
        res = await submitSurveyAnswerApi(answer, customAnswer, school, grade, token);
      } catch (apiErr: any) {
        console.warn('Backend survey API error, using direct profile update:', apiErr?.message);
        res = {
          success: true,
          reward: 20,
          newJokers: (profile?.jokers || 20) + 20,
        };
        try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            surveyCompleted: true,
            surveyAnswer: answer,
            surveyAnswerCustom: customAnswer || null,
            surveySchool: school,
            surveyGrade: grade,
            jokers: res.newJokers,
          });
        } catch (dbErr) {
          console.warn('Direct Firestore write warning:', dbErr);
        }
      }

      setProfileAndCache(prev => prev ? {
        ...prev,
        jokers: res.newJokers,
        surveyCompleted: true,
        surveyAnswer: answer,
        surveyAnswerCustom: customAnswer,
        surveySchool: school,
        surveyGrade: grade,
      } : null);
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
      setProfileAndCache(res.updatedProfile);
      toast.success(`🔥 Streak prodloužen na ${res.newStreak} ${res.newStreak === 1 ? 'den' : res.newStreak < 5 ? 'dny' : 'dní'}! Maximální kapacita žolíků se zvýšila na ${calculateMaxJokersCap(res.newStreak)}.`);
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
    isPremium,
    isCourseUser,
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
    signOut,
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
    isPremium, 
    isCourseUser, 
    jokers, 
    streak,
    maxJokersCap,
    isProfileSettingsOpen, 
    isAuthModalOpen
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
