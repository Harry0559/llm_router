'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type Settings, loadSettings, saveSettings } from '@/lib/settings';

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (s: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings: setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
