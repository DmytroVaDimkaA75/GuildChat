import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

export const YOUTUBE_CHANNEL_ID = 'UC06FSkmpQFBnAYvsfJUSC3w';
export const YOUTUBE_CHANNEL_HANDLE = '@foegameUA';
export const YOUTUBE_CHANNEL_NAME = 'FoEgameUA';
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@foegameUA';

const FUNCTIONS_REGION = 'europe-west1';
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedFeed = null;
let cacheExpiresAt = 0;
let pendingRequest = null;

const toTimestamp = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const normalizeYouTubeChannelFeed = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const videos = Array.isArray(source.videos) ? source.videos : [];
  const seenVideoIds = new Set();
  const normalizedVideos = videos.map((video) => {
    const id = String(video?.id || '').trim();
    if (!/^[a-z0-9_-]{11}$/i.test(id) || seenVideoIds.has(id)) return null;
    seenVideoIds.add(id);
    const rawViewCount = video?.viewCount;
    const viewCount = rawViewCount === null || rawViewCount === undefined || rawViewCount === ''
      ? Number.NaN
      : Number(rawViewCount);
    return {
      id,
      title: String(video?.title || 'YouTube video').trim().slice(0, 240),
      description: String(video?.description || '').trim().slice(0, 500),
      publishedAt: String(video?.publishedAt || '').trim(),
      thumbnail: String(video?.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`).trim(),
      url: `https://www.youtube.com/watch?v=${id}`,
      viewCount: Number.isFinite(viewCount) && viewCount >= 0 ? viewCount : null,
    };
  }).filter(Boolean).sort((left, right) => (
    toTimestamp(right.publishedAt) - toTimestamp(left.publishedAt) || left.id.localeCompare(right.id)
  ));

  return {
    channel: {
      id: YOUTUBE_CHANNEL_ID,
      title: String(source.channel?.title || YOUTUBE_CHANNEL_NAME).trim().slice(0, 120) || YOUTUBE_CHANNEL_NAME,
      handle: YOUTUBE_CHANNEL_HANDLE,
      url: YOUTUBE_CHANNEL_URL,
    },
    fetchedAt: Number(source.fetchedAt || Date.now()),
    stale: Boolean(source.stale),
    videos: normalizedVideos,
  };
};

export const loadYouTubeChannelFeed = async ({ force = false } = {}) => {
  if (!force && cachedFeed && cacheExpiresAt > Date.now()) return cachedFeed;
  if (pendingRequest) return pendingRequest;

  const functionsInstance = getFunctions(getApp(), FUNCTIONS_REGION);
  const callable = httpsCallable(functionsInstance, 'getYouTubeChannelVideos');
  pendingRequest = callable({ channelId: YOUTUBE_CHANNEL_ID })
    .then((result) => {
      const normalized = normalizeYouTubeChannelFeed(result?.data);
      cachedFeed = normalized;
      cacheExpiresAt = Date.now() + CLIENT_CACHE_TTL_MS;
      return normalized;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
};
