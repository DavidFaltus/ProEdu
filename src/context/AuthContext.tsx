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
          const role: UserRole = user.email === 'davidfaltus03@gmail.com' ? 'teacher' : 'student';
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || 'Nový uživatel',
            role,
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
    const role: UserRole = email === 'davidfaltus03@gmail.com' ? 'teacher' : 'student';
    const newProfile: UserProfile = {
      uid: user.uid,
      email: email,
      name: name,
      role: role,
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
    await updateDoc(docRef, data);
    
    // Also update Auth profile if name or photoURL is changed
    if (data.name || data.photoURL) {
      const authUpdates: any = {};
      if (data.name) authUpdates.displayName = data.name;
      
      // ONLY update Auth photoURL if it's NOT a base64 (because Auth has strict length limits)
      // We rely on Firestore profile for the actual photo
      if (data.photoURL && !data.photoURL.startsWith('data:')) {
        authUpdates.photoURL = data.photoURL;
      }
      
      if (Object.keys(authUpdates).length > 0) {
        await updateAuthProfile(user, authUpdates);
      }
    }

    setProfile(prev => prev ? { ...prev, ...data } : null);
  };

  const updateUserPassword = async (newPassword: string) => {
    if (!user) return;
    await updatePassword(user, newPassword);
  };

  return (
    <AuthContext.Provider value={{ 
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
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
