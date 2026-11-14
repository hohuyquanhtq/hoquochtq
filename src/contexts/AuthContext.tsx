import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { User, UserRole } from '../types';
import { subscribeAuthState, auth, firebaseInitError } from '../services/firebase';
import {
  fetchUserProfileFromFirestore,
  syncUserProfileByUid,
  reloadAndRefreshCurrentUser,
  loadPendingDraft,
  logoutAccount,
  mapFirebaseAuthError,
  PendingProfileDraft,
  SyncProfileByUidOptions,
} from '../services/authService';
import { StorageService } from '../services/storage';

export type SessionAuthState =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticated'
  | 'pending_approval'
  | 'rejected'
  | 'locked'
  | 'missing_profile'
  | 'firebase_error';

interface AuthContextValue {
  authState: SessionAuthState;
  firebaseUser: FirebaseUser | null;
  userProfile: User | null;
  authError: string | null;
  pendingDraft: PendingProfileDraft | null;
  postSyncNotice: string | null;
  clearPostSyncNotice: () => void;
  refreshProfile: () => Promise<{
    success: boolean;
    emailVerified: boolean;
    errorMessage?: string;
  }>;
  retrySyncMissingProfile: (
    options?: SyncProfileByUidOptions | Omit<PendingProfileDraft, 'uid' | 'email'>
  ) => Promise<{
    success: boolean;
    user?: User;
    errorMessage?: string;
    warningMessage?: string;
  }>;
  setLocalUpdatedProfile: (profile: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<SessionAuthState>(() =>
    firebaseInitError ? 'firebase_error' : 'initializing'
  );
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(firebaseInitError);
  const [pendingDraft, setPendingDraft] = useState<PendingProfileDraft | null>(null);
  const [postSyncNotice, setPostSyncNotice] = useState<string | null>(null);

  const clearPostSyncNotice = useCallback(() => {
    setPostSyncNotice(null);
  }, []);

  const resolveUserSession = useCallback(async (fbUser: FirebaseUser | null) => {
    if (firebaseInitError) {
      setAuthState('firebase_error');
      setAuthError(firebaseInitError);
      setFirebaseUser(null);
      setUserProfile(null);
      StorageService.clearActiveWorkspaceMemory();
      return;
    }

    if (!fbUser) {
      setFirebaseUser(null);
      setUserProfile(null);
      setPendingDraft(null);
      setAuthError(null);
      StorageService.clearActiveWorkspaceMemory();
      setAuthState('unauthenticated');
      return;
    }

    setFirebaseUser(fbUser);
    setAuthError(null);

    try {
      let profile = await fetchUserProfileFromFirestore(fbUser);

      // Avoid brief flash if signup just triggered onAuthStateChanged while initial setDoc is finishing
      if (!profile && loadPendingDraft(fbUser.uid)) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        profile = await fetchUserProfileFromFirestore(fbUser);
      }

      if (!profile) {
        StorageService.clearActiveWorkspaceMemory();
        setUserProfile(null);
        setPendingDraft(loadPendingDraft(fbUser.uid));
        setAuthState('missing_profile');
        return;
      }

      setUserProfile(profile);

      if (profile.status === 'locked') {
        StorageService.clearActiveWorkspaceMemory();
        setAuthState('locked');
        return;
      }

      if (profile.status === 'rejected') {
        StorageService.clearActiveWorkspaceMemory();
        setAuthState('rejected');
        return;
      }

      if (profile.role === 'teacher' && profile.status !== 'active') {
        StorageService.clearActiveWorkspaceMemory();
        setAuthState('pending_approval');
        return;
      }

      StorageService.setActiveWorkspaceUid(profile.uid || profile.id);
      setAuthState('authenticated');
    } catch (err) {
      console.error('[HQTest AuthContext] Failed to resolve user profile:', err);
      StorageService.clearActiveWorkspaceMemory();
      setAuthError(mapFirebaseAuthError(err));
      setPendingDraft(loadPendingDraft(fbUser.uid));
      setAuthState('missing_profile');
    }
  }, []);

  useEffect(() => {
    if (firebaseInitError) {
      setAuthState('firebase_error');
      setAuthError(firebaseInitError);
      return;
    }

    const unsubscribe = subscribeAuthState((fbUser) => {
      void resolveUserSession(fbUser);
    });

    return () => unsubscribe();
  }, [resolveUserSession]);

  const refreshProfile = useCallback(async () => {
    const refreshRes = await reloadAndRefreshCurrentUser();
    const current = auth?.currentUser || firebaseUser || null;
    if (current) {
      setFirebaseUser(current);
    }
    await resolveUserSession(current);
    return {
      success: refreshRes.success,
      emailVerified: refreshRes.emailVerified,
      errorMessage: refreshRes.errorMessage,
    };
  }, [firebaseUser, resolveUserSession]);

  const retrySyncMissingProfile = useCallback(
    async (options?: SyncProfileByUidOptions | Omit<PendingProfileDraft, 'uid' | 'email'>) => {
      const current = auth?.currentUser || firebaseUser;
      if (!current) {
        return { success: false, errorMessage: 'Không tìm thấy phiên đăng nhập Firebase hiện tại.' };
      }

      const draft = loadPendingDraft(current.uid);
      let syncOpts: SyncProfileByUidOptions;

      if (options && 'intendedRole' in options) {
        syncOpts = options;
      } else if (options) {
        syncOpts = {
          intendedRole: options.role,
          name: options.name,
          phone: options.phone,
          school: options.school,
          className: options.className,
          classCode: options.classCode,
        };
      } else if (draft) {
        syncOpts = {
          intendedRole: draft.role,
          name: draft.name,
          phone: draft.phone,
          school: draft.school,
          className: draft.className,
          classCode: draft.classCode,
        };
      } else {
        return { success: false, errorMessage: 'Vui lòng điền thông tin hồ sơ để hoàn tất đồng bộ.' };
      }

      try {
        const res = await syncUserProfileByUid(current, syncOpts);
        if (!res.success || !res.user) {
          return {
            success: false,
            errorMessage: res.errorMessage || 'Đồng bộ hồ sơ chưa thành công.',
          };
        }

        setPostSyncNotice('Đồng bộ hồ sơ thành công');
        setUserProfile(res.user);
        setPendingDraft(null);
        await resolveUserSession(auth?.currentUser || current);
        return {
          success: true,
          user: res.user,
          warningMessage: res.warningMessage,
        };
      } catch (err) {
        return { success: false, errorMessage: mapFirebaseAuthError(err) };
      }
    },
    [firebaseUser, resolveUserSession]
  );

  const setLocalUpdatedProfile = useCallback((profile: User) => {
    setUserProfile(profile);
  }, []);

  const logout = useCallback(async () => {
    StorageService.clearActiveWorkspaceMemory();
    setUserProfile(null);
    setPendingDraft(null);
    setAuthError(null);
    setPostSyncNotice(null);
    await logoutAccount();
    setAuthState('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        firebaseUser,
        userProfile,
        authError,
        pendingDraft,
        postSyncNotice,
        clearPostSyncNotice,
        refreshProfile,
        retrySyncMissingProfile,
        setLocalUpdatedProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export function canAccessRole(user: User | null, allowedRoles: UserRole[]): boolean {
  if (!user) return false;
  if (user.status && user.status !== 'active') return false;
  return allowedRoles.includes(user.role);
}
