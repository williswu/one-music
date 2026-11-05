import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";
import { storeKey } from "./store-keys";
import { idbStorage } from "@/lib/storage-adapter";
import { encryptString, decryptString } from "@/lib/crypto-storage";
import { accountMe } from "@/lib/api/account";

interface AccountState {
  email: string | null;
  token: string | null;
  restored: boolean;

  setAccount: (email: string, token: string) => void;
  clearAccount: () => void;
  setRestored: (v: boolean) => void;
}

type PersistedState = {
  email: string | null;
  token: string | null;
};

/** token/email 密文落盘，与 sync-store 同一套加密适配 */
const encryptedAccountStorage = {
  getItem: async (
    name: string
  ): Promise<StorageValue<PersistedState> | null> => {
    const raw = await idbStorage.getItem(name);
    if (!raw) return null;
    const parsed: StorageValue<PersistedState> = JSON.parse(raw);
    for (const field of ["email", "token"] as const) {
      const v = parsed.state?.[field];
      if (!v) continue;
      try {
        parsed.state[field] = await decryptString(v);
      } catch {
        // 旧版明文数据，直接使用原值
      }
    }
    return parsed;
  },
  setItem: async (
    name: string,
    value: StorageValue<PersistedState>
  ): Promise<void> => {
    const toStore = structuredClone(value);
    for (const field of ["email", "token"] as const) {
      if (toStore.state[field]) {
        toStore.state[field] = await encryptString(toStore.state[field]!);
      }
    }
    await idbStorage.setItem(name, JSON.stringify(toStore));
  },
  removeItem: async (name: string): Promise<void> => {
    await idbStorage.removeItem(name);
  },
};

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      email: null,
      token: null,
      restored: false,

      setAccount: (email, token) => set({ email, token, restored: true }),
      clearAccount: () => set({ email: null, token: null, restored: true }),
      setRestored: (v) => set({ restored: v }),
    }),
    {
      name: storeKey.AccountStore,
      storage: encryptedAccountStorage,
      partialize: (state) => ({ email: state.email, token: state.token }),
    }
  )
);

/**
 * 启动时恢复会话：token 有效则把账号绑定的 syncKey 写回 sync-store。
 * 服务端 /auth/me 是 syncKey 的唯一真源，本地 syncKey 只是缓存。
 */
export async function restoreAccountSession() {
  const { token, setAccount, clearAccount, setRestored } =
    useAccountStore.getState();

  if (!token) {
    setRestored(true);
    return;
  }

  try {
    const { email, syncKey } = await accountMe(token);
    setAccount(email, token);
    if (syncKey) {
      const { useSyncStore } = await import("./sync-store");
      useSyncStore.getState().setSyncKey(syncKey);
    }
  } catch {
    clearAccount();
  } finally {
    setRestored(true);
  }
}
