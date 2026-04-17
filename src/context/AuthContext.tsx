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

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  isProfileSettingsOpen: boolean;
  setIsProfileSettingsOpen: (open: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  isProfileSettingsOpen: false,
  setIsProfileSettingsOpen: () => {},
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signOut: async () => {},
  updateProfileData: async () => {},
  updateUserPassword: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        const docRef = doc(db, 'users', user.uid);
        // Jednorázové čtení místo real-time listeneru — šetří Firestore reads
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // Rule 4: Role never derived from email in frontend.
          // Rule 16: Least privilege - default to student.
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || 'Nový uživatel',
            role: 'student',
            createdAt: Timestamp.now(),
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
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
    await firebaseSignOut(auth);
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid);
    
    // Rule 5 & 7: Frontend never sets or changes privileged/immutable fields
    const { role, uid, createdAt, ...safeData } = data as any;
    
    if (Object.keys(safeData).length > 0) {
      await updateDoc(docRef, safeData);
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
        await updateAuthProfile(user, authUpdates);
      }
    }

    setProfile(prev => prev ? { ...prev, ...safeData } : null);
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
    isProfileSettingsOpen,
    setIsProfileSettingsOpen,
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithEmail, 
    signOut,
    updateProfileData,
    updateUserPassword
  }), [user, profile, loading, isAuthReady, isProfileSettingsOpen]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
