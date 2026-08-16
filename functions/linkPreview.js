const dns = require("node:dns").promises;
const net = require("node:net");

const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 7_000;

const decodeHtml = (value = "") => String(value)
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/\s+/g, " ")
  .trim();

const cleanText = (value, maxLength) => decodeHtml(String(value || "").replace(/<[^>]*>/g, " ")).slice(0, maxLength);

const isPrivateAddress = (address) => {
  const normalized = String(address || "").toLowerCase().split("%")[0];
  if (!normalized) return true;
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (net.isIP(normalized) === 4 ? normalized : "");
  if (!ipv4) return false;
  const parts = ipv4.split(".").map(Number);
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};

const normalizePreviewUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value || value.length > 2_048) throw new Error("invalid-url");
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) throw new Error("invalid-url");
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("invalid-url");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("unsupported-port");
  }
  url.hash = "";
  return url;
};

const assertPublicUrl = async (url) => {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("private-host");
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("private-host");
    return;
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("private-host");
};

const getPublicAssetUrl = async (rawUrl) => {
  if (!rawUrl) return "";
  try {
    const url = normalizePreviewUrl(rawUrl);
    await assertPublicUrl(url);
    return url.toString();
  } catch (_error) {
    return "";
  }
};

const parseAttributes = (tag) => {
  const attributes = {};
  const regex = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = regex.exec(tag))) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return attributes;
};

const extractLinkMetadata = (html, pageUrl) => {
  const meta = {};
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    const key = String(attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !meta[key]) meta[key] = attrs.content;
  }
  const titleMatch = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanText(meta["og:title"] || meta["twitter:title"] || titleMatch?.[1], 180);
  const description = cleanText(meta["og:description"] || meta.description || meta["twitter:description"], 320);
  const siteName = cleanText(meta["og:site_name"], 120);
  let image = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || "";
  let icon = "";
  for (const tag of String(html || "").match(/<link\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    const rel = String(attrs.rel || "").toLowerCase().split(/\s+/);
    if (attrs.href && (rel.includes("icon") || rel.includes("apple-touch-icon"))) {
      icon = attrs.href;
      break;
    }
  }
  try {
    const imageUrl = image ? new URL(decodeHtml(image), pageUrl) : null;
    image = imageUrl && ["http:", "https:"].includes(imageUrl.protocol) ? imageUrl.toString() : "";
  } catch (_error) {
    image = "";
  }
  try {
    const iconUrl = icon ? new URL(decodeHtml(icon), pageUrl) : null;
    icon = iconUrl && ["http:", "https:"].includes(iconUrl.protocol) ? iconUrl.toString() : "";
  } catch (_error) {
    icon = "";
  }
  return { title, description, image, siteName, icon };
};

const readLimitedText = async (response) => {
  if (!response.body?.getReader) return (await response.text()).slice(0, MAX_HTML_BYTES);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_HTML_BYTES - received;
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    received += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
    if (value.byteLength > remaining || received === MAX_HTML_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
};

const getYouTubeVideoId = (url) => {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|live|shorts)\/([^/?#]+)/)?.[1] || "";
  }
  return /^[a-z0-9_-]{11}$/i.test(videoId) ? videoId : "";
};

const createYouTubePreview = (url, metadata = {}) => {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  let image = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const thumbnailUrl = metadata.thumbnail_url ? new URL(metadata.thumbnail_url) : null;
    if (thumbnailUrl && thumbnailUrl.protocol === "https:") image = thumbnailUrl.toString();
  } catch (_error) {
    // Keep the deterministic YouTube thumbnail.
  }
  return {
    status: "ok",
    kind: "video",
    url: url.toString(),
    host: "youtube.com",
    title: cleanText(metadata.title, 180) || "YouTube video",
    description: cleanText(metadata.author_name, 120),
    image,
  };
};

const fetchYouTubePreview = async (url) => {
  const fallback = createYouTubePreview(url);
  if (!fallback) return null;
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", url.toString());
    endpoint.searchParams.set("format", "json");
    await assertPublicUrl(endpoint);
    const response = await fetch(endpoint, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "GuildChat-LinkPreview/1.0", accept: "application/json" },
    });
    if (!response.ok) return fallback;
    const data = JSON.parse(await readLimitedText(response));
    return createYouTubePreview(url, data) || fallback;
  } catch (_error) {
    return fallback;
  }
};

const createImagePreview = (url) => {
  const encodedFilename = url.pathname.split("/").filter(Boolean).pop() || "";
  let filename = encodedFilename;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch (_error) {
    // Keep the encoded filename when a server returns a malformed URL escape.
  }
  return {
    status: "ok",
    kind: "image",
    url: url.toString(),
    host: url.hostname.replace(/^www\./i, ""),
    title: filename || url.hostname,
    description: "",
    image: url.toString(),
  };
};

const fetchLinkPreview = async (rawUrl) => {
  let url = normalizePreviewUrl(rawUrl);
  const youtubePreview = await fetchYouTubePreview(url);
  if (youtubePreview) return youtubePreview;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "GuildChat-LinkPreview/1.0",
        accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.9",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error("too-many-redirects");
      url = normalizePreviewUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`http-${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("image/")) return createImagePreview(url);
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("not-html");
    const html = await readLimitedText(response);
    const metadata = extractLinkMetadata(html, url.toString());
    const [image, icon] = await Promise.all([
      getPublicAssetUrl(metadata.image),
      getPublicAssetUrl(metadata.icon || new URL("/favicon.ico", url).toString()),
    ]);
    return {
      status: metadata.title || metadata.description || image || metadata.siteName ? "ok" : "unavailable",
      kind: "page",
      url: url.toString(),
      host: url.hostname.replace(/^www\./i, ""),
      title: metadata.title || url.hostname,
      description: metadata.description,
      image,
      siteName: metadata.siteName,
      icon,
    };
  }
  throw new Error("too-many-redirects");
};

module.exports = {
  createImagePreview,
  createYouTubePreview,
  extractLinkMetadata,
  fetchLinkPreview,
  getYouTubeVideoId,
  isPrivateAddress,
  normalizePreviewUrl,
};
