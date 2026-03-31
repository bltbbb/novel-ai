import { create } from 'zustand';
import { checkServerHealth } from '@/lib/server-health';

export type ServerAvailability = 'unknown' | 'online' | 'offline';

interface ServerStatusState {
  availability: ServerAvailability;
  isChecking: boolean;
  message: string;
  checkedAt: string | null;
  refresh: (serverUrl: string) => Promise<boolean>;
  setOffline: (message: string) => void;
}

export const useServerStatusStore = create<ServerStatusState>((set) => ({
  availability: 'unknown',
  isChecking: false,
  message: '尚未检测服务状态',
  checkedAt: null,

  async refresh(serverUrl) {
    set({ isChecking: true });

    const result = await checkServerHealth(serverUrl);

    set({
      availability: result.ok ? 'online' : 'offline',
      isChecking: false,
      message: result.message,
      checkedAt: result.checkedAt,
    });

    return result.ok;
  },

  setOffline(message) {
    set({
      availability: 'offline',
      isChecking: false,
      message,
      checkedAt: new Date().toISOString(),
    });
  },
}));
