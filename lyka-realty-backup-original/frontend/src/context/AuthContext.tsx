import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, UserRole } from '../types';
import { api, setSessionExpiryHandler } from '../services/api';

export const purgeSensitiveStorage = () => {
  try {
    const sensitiveKeys = [
      'lyka_token',
      'lyka_user',
      'token',
      'access_token',
      'jwt',
      'refresh_token',
      'api_key',
      'secret',
      'authorization',
    ];
    sensitiveKeys.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('jwt'))) {
        localStorage.removeItem(k);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('jwt'))) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // Ignore restricted storage contexts
  }
};

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, expectedRole?: string) => Promise<User>;
  register: (fullName: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Clear obsolete and insecure credentials from browser storage on startup
    purgeSensitiveStorage();
    let active = true;

    api.getMe()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    setSessionExpiryHandler(() => {
      if (active) {
        setUser(null);
        purgeSensitiveStorage();
      }
    });

    return () => {
      active = false;
      setSessionExpiryHandler(null);
    };
  }, []);

  const login = async (email: string, password: string, expectedRole?: string) => {
    setIsLoading(true);
    try {
      const result = await api.login({ email, password, expected_role: expectedRole });
      purgeSensitiveStorage();
      setUser(result.user);
      return result.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (fullName: string, email: string, password: string, phone?: string) => {
    setIsLoading(true);
    try {
      const result = await api.register({ email, password, full_name: fullName, phone });
      purgeSensitiveStorage();
      setUser(result.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout API error:', err);
    }
    setUser(null);
    purgeSensitiveStorage();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isAuthenticated: user !== null,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

