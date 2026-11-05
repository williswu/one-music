// PBKDF2 password hashing via Web Crypto (Workers runtime, no deps).
// Stored format: pbkdf2$<iterations>$<base64-salt>$<base64-hash>

const ITERATIONS = 100_000;
const KEY_LEN = 32;

const toB64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_LEN * 8
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt.buffer)}$${toB64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [tag, iterStr, saltB64, hashB64] = stored.split("$");
  if (tag !== "pbkdf2") return false;
  const iterations = parseInt(iterStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  try {
    const hash = await derive(password, fromB64(saltB64), iterations);
    const expected = fromB64(hashB64);
    const actual = new Uint8Array(hash);
    if (actual.length !== expected.length) return false;
    // constant-time compare
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}
