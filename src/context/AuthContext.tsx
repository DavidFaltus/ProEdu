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
  DEFAULT_DAILY_JOKERS, 
  getTodayDateString 
} from '../services/jokerService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  isTeacher: boolean;
  isPremium: boolean;
  isCourseUser: boolean;
  jokers: number;
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
  claimVideoReward: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  isTeacher: false,
  isPremium: false,
  isCourseUser: false,
  jokers: DEFAULT_DAILY_JOKERS,
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
  claimVideoReward: async () => {},
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openAuthModal = () => setIsAuthModalOpen(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        const docRef = doc(db, 'users', user.uid);
        // Jednorázové čtení místo real-time listeneru — šetří Firestore reads
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const rawProfile = docSnap.data() as UserProfile;
          const freshProfile = await checkAndResetDailyJokers(rawProfile);
          const override = getDevRoleOverride();
          if (override) {
            freshProfile.role = override;
          }
          setProfile(freshProfile);
        } else {
          // Rule 4: Role never derived from email in frontend.
          // Rule 16: Least privilege - default to free.
          const today = getTodayDateString();
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || 'Nový uživatel',
            role: 'free',
            jokers: DEFAULT_DAILY_JOKERS,
            lastJokerResetDate: today,
            dailyVideosWatched: 0,
            createdAt: Timestamp.now(),
          };
          const override = getDevRoleOverride();
          if (override) {
            newProfile.role = override;
          }
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        const override = getDevRoleOverride();
        if (override) {
          setProfile({
            uid: 'guest-preview',
            email: 'host@proedu.cz',
            name: `Host (${override.toUpperCase()})`,
            role: override,
            jokers: DEFAULT_DAILY_JOKERS,
            createdAt: Timestamp.now(),
          });
        } else {
          setProfile(null);
        }
      }
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

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
    const newProfile: UserProfile = {
      uid: user.uid,
      email: email,
      name: name,
      role: 'student',
      createdAt: Timestamp.now(),
    };
    await setDoc(docRef, newProfile);
    setProfile(newProfile);
  };

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('proedu_dev_role_override');
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
      safeData.role = role;
      if (typeof window !== 'undefined') {
        localStorage.setItem('proedu_dev_role_override', role);
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

    setProfile(prev => prev ? { ...prev, ...safeData } : null);
  };

  const isTeacher = profile?.role === 'teacher';
  const isPremium = profile?.role === 'premium' || profile?.role === 'course' || profile?.role === 'teacher';
  const isCourseUser = profile?.role === 'course' || profile?.role === 'teacher';
  const jokers = profile?.jokers ?? DEFAULT_DAILY_JOKERS;

  const consumeOneJoker = async (): Promise<boolean> => {
    if (!profile) return false;
    if (isPremium) return true;
    const res = await consumeJoker(profile);
    if (res.success) {
      setProfile(prev => prev ? { ...prev, jokers: res.remainingJokers } : null);
    }
    return res.success;
  };

  const claimVideoReward = async () => {
    if (!profile) return;
    const res = await rewardVideoJokers(profile);
    if (res.success) {
      setProfile(prev => prev ? {
        ...prev,
        jokers: res.newJokers,
        dailyVideosWatched: (prev.dailyVideosWatched || 0) + 1,
      } : null);
    }
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
  }), [
    user, 
    profile, 
    loading, 
    isAuthReady, 
    isTeacher, 
    isPremium, 
    isCourseUser, 
    jokers, 
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
