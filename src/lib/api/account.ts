import { getApiUrl, fetchWithTimeout, unwrap } from "./config";

const authUrl = () => `${getApiUrl()}/auth`;

export type AccountAuthResponse = {
  token: string;
  email: string;
  syncKey: string;
};

export const accountRegister = (email: string, password: string) =>
  unwrap<AccountAuthResponse>(
    fetchWithTimeout(`${authUrl()}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );

export const accountLogin = (email: string, password: string) =>
  unwrap<AccountAuthResponse>(
    fetchWithTimeout(`${authUrl()}/user-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );

/** 会话恢复：token 有效则返回绑定的 email 与 syncKey */
export const accountMe = (token: string) =>
  unwrap<{ email: string; syncKey: string }>(
    fetchWithTimeout(`${authUrl()}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );

export const accountLogout = (token: string) =>
  fetchWithTimeout(`${authUrl()}/user-logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
