import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { signJWT, signUserJWT, verifyJWT } from "@utils/auth";
import { hashPassword, verifyPassword } from "@utils/password";

import type { Env } from "../types/hono";
import { fail, ok } from "@utils/response";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post(
  "/login",
  zValidator(
    "json",
    z.object({
      password: z.string().min(1, "Password required"),
    })
  ),
  async (c) => {
    const { password } = c.req.valid("json");
    const env = c.env;

    if (!password || password !== env.PASSWORD) {
      return fail(c, "Unauthorized", 401);
    }

    const secret = env.PASSWORD || "secret";
    const token = await signJWT(secret);

    const isSecure = c.req.url.startsWith("https");
    // Set Cookie
    const cookie = [
      `auth=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=86400",
      isSecure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");

    c.header("Set-Cookie", cookie);
    return ok(c, { token }, "Login successful", 200);
  }
);

authRoutes.post("/logout", (c) => {
  const isSecure = c.req.url.startsWith("https");
  const cookie = [
    "auth=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isSecure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  c.header("Set-Cookie", cookie);
  return ok(c, null, "Logout successful", 200);
});

// ================================================================
// 用户邮箱登录（极简版，参考 new-api 的域名白名单策略）
// 账号存 KV：otter-music:account:<email> → { passwordHash, syncKey, createdAt }
// 注册时生成 syncKey 绑定账号，客户端拿到后走既有 /sync/v2 链路
// ================================================================

const ACCOUNT_PREFIX = "otter-music:account:";

// 与 new-api 一致的默认邮箱域白名单，可用 EMAIL_DOMAIN_WHITELIST 环境变量覆盖
const DEFAULT_EMAIL_DOMAINS = [
  "gmail.com",
  "163.com",
  "126.com",
  "qq.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "yahoo.com",
  "foxmail.com",
  "139.com",
  "189.cn",
  "sina.com",
  "sohu.com",
];

const emailSchema = z
  .string()
  .email("邮箱格式不正确")
  .max(254)
  .transform((v) => v.trim().toLowerCase());

const passwordSchema = z.string().min(6, "密码至少 6 位").max(72);

function checkEmailDomain(email: string, env: Env): string | null {
  const domain = email.split("@")[1];
  const whitelist = (
    env.EMAIL_DOMAIN_WHITELIST || DEFAULT_EMAIL_DOMAINS.join(",")
  )
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return whitelist.includes(domain) ? null : `暂不支持 ${domain} 邮箱注册`;
}

// 30 天有效期的用户 JWT，sub=email
function userCookie(token: string, c: { req: { url: string } }) {
  const isSecure = c.req.url.startsWith("https");
  return [
    `user_auth=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
    isSecure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generateSyncKey = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (b) => ALPHABET[b % ALPHABET.length]
  ).join("");

interface AccountRecord {
  passwordHash: string;
  syncKey: string;
  createdAt: number;
}

async function readAccount(
  kv: Env["oh_file_url"],
  email: string
): Promise<AccountRecord | null> {
  return (
    ((await kv.get(
      `${ACCOUNT_PREFIX}${email}`,
      "json"
    )) as AccountRecord | null) ?? null
  );
}

authRoutes.post(
  "/register",
  zValidator(
    "json",
    z.object({ email: emailSchema, password: passwordSchema })
  ),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const env = c.env;

    const domainError = checkEmailDomain(email, env);
    if (domainError) return fail(c, domainError, 400);

    const kv = env.oh_file_url;
    if (await readAccount(kv, email)) {
      return fail(c, "该邮箱已注册", 409);
    }

    const record: AccountRecord = {
      passwordHash: await hashPassword(password),
      syncKey: generateSyncKey(),
      createdAt: Date.now(),
    };
    await kv.put(`${ACCOUNT_PREFIX}${email}`, JSON.stringify(record));

    const token = await signUserJWT(env.PASSWORD || "secret", email);
    c.header("Set-Cookie", userCookie(token, c));
    return ok(c, { token, email, syncKey: record.syncKey }, "注册成功", 201);
  }
);

authRoutes.post(
  "/user-login",
  zValidator(
    "json",
    z.object({ email: emailSchema, password: passwordSchema })
  ),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const env = c.env;

    const record = await readAccount(env.oh_file_url, email);
    if (!record || !(await verifyPassword(password, record.passwordHash))) {
      return fail(c, "邮箱或密码错误", 401);
    }

    const token = await signUserJWT(env.PASSWORD || "secret", email);
    c.header("Set-Cookie", userCookie(token, c));
    return ok(c, { token, email, syncKey: record.syncKey }, "登录成功", 200);
  }
);

// 会话恢复：客户端带 Bearer <user token> 或 user_auth cookie，换回 syncKey
authRoutes.get("/me", async (c) => {
  const env = c.env;
  const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/)?.[1];
  const cookieToken = c.req
    .header("Cookie")
    ?.match(/(?:^|;\s*)user_auth=([^;]+)/)?.[1];
  const token = bearer || cookieToken;
  if (!token) return fail(c, "Unauthorized", 401);

  try {
    const { payload } = await verifyJWT(token, env.PASSWORD || "secret");
    if (payload.typ !== "user" || typeof payload.sub !== "string") {
      return fail(c, "Unauthorized", 401);
    }
    const record = await readAccount(env.oh_file_url, payload.sub);
    if (!record) return fail(c, "账号不存在", 404);
    return ok(c, { email: payload.sub, syncKey: record.syncKey });
  } catch {
    return fail(c, "Unauthorized", 401);
  }
});

// 退出用户会话（清 user_auth cookie；syncKey 留在客户端本地）
authRoutes.post("/user-logout", (c) => {
  c.header(
    "Set-Cookie",
    userCookie("", c).replace("Max-Age=2592000", "Max-Age=0")
  );
  return ok(c, null, "已退出登录", 200);
});
