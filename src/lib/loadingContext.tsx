import React, { createContext, useContext, useState, useCallback } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  activeKeys: string[];
  startLoading: (key?: string) => void;
  stopLoading: (key?: string) => void;
  setGlobalLoading: (loading: boolean) => void;
  withLoading: <T>(fn: () => Promise<T>, key?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [isManualGlobal, setIsManualGlobal] = useState(false);

  const startLoading = useCallback((key: string = 'default') => {
    setActiveKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const stopLoading = useCallback((key: string = 'default') => {
    setActiveKeys((prev) => prev.filter((k) => k !== key));
  }, []);

  const setGlobalLoading = useCallback((loading: boolean) => {
    setIsManualGlobal(loading);
  }, []);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>, key: string = 'default'): Promise<T> => {
    startLoading(key);
    try {
      return await fn();
    } finally {
      stopLoading(key);
    }
  }, [startLoading, stopLoading]);

  const isLoading = isManualGlobal || activeKeys.length > 0;

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        activeKeys,
        startLoading,
        stopLoading,
        setGlobalLoading,
        withLoading,
      }}
    >
      {/* Global top progress indicator bar */}
      {isLoading && (
        <div
          id="global-loading-progress-bar"
          className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 via-accent to-emerald-400 z-[9999] animate-pulse shadow-sm shadow-teal-500/50"
        />
      )}
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};
