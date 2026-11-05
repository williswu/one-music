import { Hono } from "hono";
import { ok, fail, encodeContentDisposition } from "../utils/response";
import { Env } from "../types/hono";

const app = new Hono<{ Bindings: Env }>();

const GITHUB_API_URL =
  "https://api.github.com/repos/williswu/one-music/releases/latest";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string;
  published_at: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

interface UpdateInfo {
  latestVersion: string;
  changelog: string;
  downloadUrl: string;
  directUrl: string;
  publishDate: string;
  size: number;
}

/* =========================
   获取最新版本信息
========================= */
app.get("/check", async (c) => {
  try {
    const release: GitHubRelease = await fetchRelease(c.env.GITHUB_TOKEN);

    // iOS 端 release 没有 apk 资产，回退到 release 页面链接
    const apk = release.assets.find((a) => a.name.endsWith(".apk"));

    const updateInfo: UpdateInfo = {
      latestVersion: release.tag_name,
      changelog: release.body,
      downloadUrl: apk ? buildProxyUrl(c.req.url, apk) : release.html_url,
      directUrl: apk ? apk.browser_download_url : release.html_url,
      publishDate: release.published_at,
      size: apk?.size ?? 0,
    };

    return ok(c, updateInfo);
  } catch (e) {
    console.error(e);
    return fail(c, "Update check failed", 500);
  }
});

/* =========================
   下载代理
========================= */
app.get("/download", async (c) => {
  const url = c.req.query("url");
  const filename = c.req.query("filename") || "app-release.apk";

  if (!url) return fail(c, "Missing url", 400);
  if (!isValidGithubUrl(url)) return fail(c, "Invalid source", 403);

  try {
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Otter-Music-App",
    };
    if (c.env.GITHUB_TOKEN) {
      fetchHeaders.Authorization = `Bearer ${c.env.GITHUB_TOKEN}`;
    }

    const resp = await fetch(url, {
      headers: fetchHeaders,
      redirect: "follow",
    });

    if (!resp.ok || !resp.body) return fail(c, "Download failed", 502);

    const headers = new Headers(resp.headers);
    headers.set(
      "Content-Disposition",
      encodeContentDisposition(filename, false)
    );
    headers.set("Content-Type", "application/vnd.android.package-archive");
    headers.set("Cache-Control", "public, max-age=3600");
    headers.delete("Set-Cookie");

    return new Response(resp.body, { status: resp.status, headers });
  } catch (e) {
    console.error(e);
    return fail(c, "Download error", 500);
  }
});

/* =========================
   工具函数
========================= */

async function fetchRelease(token?: string) {
  const headers: Record<string, string> = {
    "User-Agent": "Otter-Music-App",
    Accept: "application/vnd.github.v3+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resp = await fetch(GITHUB_API_URL, {
    headers,
    cf: {
      cacheTtl: 600, // 缓存 10 分钟
      cacheEverything: true,
    },
  } as any);

  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status}`);
  }

  return resp.json();
}

function buildProxyUrl(
  baseUrl: string,
  asset: { name: string; browser_download_url: string }
) {
  const origin = new URL(baseUrl).origin;
  return `${origin}/update/download?url=${encodeURIComponent(
    asset.browser_download_url
  )}&filename=${encodeURIComponent(asset.name)}`;
}

function isValidGithubUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return ["github.com", "objects.githubusercontent.com"].some((domain) =>
      host.endsWith(domain)
    );
  } catch {
    return false;
  }
}

export const updateRoutes = app;
