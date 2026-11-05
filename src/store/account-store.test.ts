import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage-adapter", () => ({
  idbStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/crypto-storage", () => ({
  encryptString: vi.fn(async (str: string) => `mock_encrypted:${str}`),
  decryptString: vi.fn(async (str: string) =>
    str.replace("mock_encrypted:", "")
  ),
}));

const mockAccountMe = vi.fn();
vi.mock("@/lib/api/account", () => ({
  accountMe: () => mockAccountMe(),
}));

import { restoreAccountSession, useAccountStore } from "./account-store";
import { useSyncStore } from "./sync-store";

describe("account store", () => {
  beforeEach(() => {
    useAccountStore.setState({ email: null, token: null, restored: false });
    useSyncStore.setState({ syncKey: null });
    mockAccountMe.mockReset();
  });

  it("sets restored flag and skips lookup without token", async () => {
    await restoreAccountSession();
    expect(useAccountStore.getState().restored).toBe(true);
    expect(mockAccountMe).not.toHaveBeenCalled();
  });

  it("restores session and writes account syncKey to sync store", async () => {
    useAccountStore.setState({ token: "jwt-token" });
    mockAccountMe.mockResolvedValue({ email: "a@b.com", syncKey: "SK123" });

    await restoreAccountSession();

    expect(useAccountStore.getState()).toMatchObject({
      email: "a@b.com",
      token: "jwt-token",
      restored: true,
    });
    expect(useSyncStore.getState().syncKey).toBe("SK123");
  });

  it("clears account when token is rejected", async () => {
    useAccountStore.setState({ token: "expired", email: "a@b.com" });
    mockAccountMe.mockRejectedValue(new Error("401"));

    await restoreAccountSession();

    expect(useAccountStore.getState()).toMatchObject({
      email: null,
      token: null,
      restored: true,
    });
  });
});
