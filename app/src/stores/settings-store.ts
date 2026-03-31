import { create } from 'zustand';
import { loadAppSettings, saveAppSettings } from '@/lib/db';
import { DEFAULT_SETTINGS } from '@/lib/runtime-config';
import type { AppSettings } from '@/types';

interface SettingsStoreState {
  settings: AppSettings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  async loadSettings() {
    const settings = await loadAppSettings();
    set({ settings, isLoaded: true });
  },

  async updateSettings(patch) {
    const nextSettings: AppSettings = {
      ...get().settings,
      ...patch,
    };

    await saveAppSettings(nextSettings);
    set({ settings: nextSettings, isLoaded: true });
  },

  async resetSettings() {
    await saveAppSettings(DEFAULT_SETTINGS);
    set({ settings: DEFAULT_SETTINGS, isLoaded: true });
  },
}));
