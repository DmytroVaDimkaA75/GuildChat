const YOUTUBE_CHANNEL = Object.freeze({
  id: "UC06FSkmpQFBnAYvsfJUSC3w",
  fallbackTitle: "FoEgameUA",
  handle: "@foegameUA",
  url: "https://www.youtube.com/@foegameUA",
});

const YOUTUBE_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL.id}`;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 1024 * 1024;

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decodeXml = (value = "") => String(value)
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
    try {
      return String.fromCodePoint(Number.parseInt(code, 16));
    } catch (_error) {
      return "";
    }
  })
  .replace(/&#(\d+);/g, (_, code) => {
    try {
      return String.fromCodePoint(Number(code));
    } catch (_error) {
      return "";
    }
  })
  .replace(/&quot;/gi, '"')
  .replace(/&apos;|&#39;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&amp;/gi, "&");

const cleanXmlText = (value, maxLength) => decodeXml(value)
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const readElementText = (source, elementName) => {
  const escapedName = escapeRegExp(elementName);
  return String(source || "").match(
    new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, "i")
  )?.[1] || "";
};

const readTagAttribute = (source, tagName, attributeName) => {
  const escapedTag = escapeRegExp(tagName);
  const tag = String(source || "").match(new RegExp(`<${escapedTag}\\b[^>]*>`, "i"))?.[0] || "";
  const escapedAttribute = escapeRegExp(attributeName);
  const match = tag.match(new RegExp(`${escapedAttribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return decodeXml(match?.[1] ?? match?.[2] ?? "");
};

const toTimestamp = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const parseYouTubeChannelFeed = (xml) => {
  const source = String(xml || "");
  if (!/<feed\b/i.test(source)) throw new Error("invalid-youtube-feed");

  const firstEntryIndex = source.search(/<entry\b/i);
  const feedHeader = firstEntryIndex >= 0 ? source.slice(0, firstEntryIndex) : source;
  const channelTitle = cleanXmlText(readElementText(feedHeader, "title"), 120) || YOUTUBE_CHANNEL.fallbackTitle;
  const entries = source.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const seenVideoIds = new Set();

  const videos = entries.map((entry) => {
    const id = cleanXmlText(readElementText(entry, "yt:videoId"), 32);
    if (!/^[a-z0-9_-]{11}$/i.test(id) || seenVideoIds.has(id)) return null;
    seenVideoIds.add(id);

    const publishedAt = cleanXmlText(readElementText(entry, "published"), 64);
    const rawViewCount = readTagAttribute(entry, "media:statistics", "views");
    const viewCountValue = rawViewCount === "" ? Number.NaN : Number(rawViewCount);
    return {
      id,
      title: cleanXmlText(readElementText(entry, "title"), 240) || "YouTube video",
      description: cleanXmlText(readElementText(entry, "media:description"), 500),
      publishedAt,
      thumbnail: readTagAttribute(entry, "media:thumbnail", "url") ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
      viewCount: Number.isFinite(viewCountValue) && viewCountValue >= 0 ? viewCountValue : null,
    };
  }).filter(Boolean).sort((left, right) => (
    toTimestamp(right.publishedAt) - toTimestamp(left.publishedAt) || left.id.localeCompare(right.id)
  ));

  return {
    channel: {
      id: YOUTUBE_CHANNEL.id,
      title: channelTitle,
      handle: YOUTUBE_CHANNEL.handle,
      url: YOUTUBE_CHANNEL.url,
    },
    videos,
  };
};

const fetchYouTubeChannelFeed = async ({ fetchImpl = global.fetch } = {}) => {
  const response = await fetchImpl(YOUTUBE_FEED_URL, {
    headers: {
      accept: "application/atom+xml,application/xml,text/xml;q=0.9",
      "user-agent": "GuildChat-YouTubeFeed/1.0",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`youtube-feed-http-${response.status}`);

  const xml = await response.text();
  if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) throw new Error("youtube-feed-too-large");
  return {
    ...parseYouTubeChannelFeed(xml),
    fetchedAt: Date.now(),
  };
};

module.exports = {
  YOUTUBE_CHANNEL,
  YOUTUBE_FEED_URL,
  decodeXml,
  fetchYouTubeChannelFeed,
  parseYouTubeChannelFeed,
};
