import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  email: string;
  name: string;
  picture: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  canEdit: boolean;
  signIn: (credential: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'gantt-auth-user';
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

const DEV_USER: User = {
  email: 'matthew@harbourshare.com',
  name: 'Dev User',
  picture: '',
  token: 'dev-token',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEV_MODE ? DEV_USER : null);
  const [isLoading, setIsLoading] = useState(!DEV_MODE);

  useEffect(() => {
    if (DEV_MODE) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const signIn = (credential: string) => {
    // Decode the JWT to get user info
    const payload = JSON.parse(atob(credential.split('.')[1]));
    const newUser: User = {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      token: credential,
    };
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const canEdit = user?.email === 'matthew@harbourshare.com';

  return (
    <AuthContext.Provider value={{ user, isLoading, canEdit, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
