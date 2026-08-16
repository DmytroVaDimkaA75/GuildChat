import { MaterialIcons } from '@expo/vector-icons';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const previewCache = new Map();
const FUNCTIONS_REGION = 'europe-west1';
const DIRECT_IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const URL_CANDIDATE_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s<]*)?/gi;

const loadLinkPreview = async (url) => {
  const functionsInstance = getFunctions(getApp(), FUNCTIONS_REGION);
  const callable = httpsCallable(functionsInstance, 'getLinkPreview');
  const result = await callable({ url });
  return result?.data || {};
};

export const normalizePreviewUrl = (value = '') => {
  const url = String(value).trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

export const getYouTubeVideoId = (value = '') => {
  try {
    const parsed = new URL(normalizePreviewUrl(value));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      videoId = parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:embed|live|shorts)\/([^/?#]+)/)?.[1] || '';
    }
    return /^[a-z0-9_-]{11}$/i.test(videoId) ? videoId : '';
  } catch (_error) {
    return '';
  }
};

const repairSpacedUrlDomains = (value) => {
  let repaired = String(value || '');
  for (let pass = 0; pass < 3; pass += 1) {
    const next = repaired.replace(
      /((?:https?:\/\/|www\.)(?:[a-z0-9-]+\.)*[a-z0-9-]+)\s*\.\s*([a-z]{2,})(?=\b)/gi,
      '$1.$2'
    );
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
};

export const extractPreviewUrls = (value = '') => {
  const text = repairSpacedUrlDomains(value);
  const matches = text.match(URL_CANDIDATE_PATTERN) || [];
  return Array.from(new Set(matches.map((url) => normalizePreviewUrl(url.replace(/[\]),.!?;:}]+$/g, ''))))).slice(0, 3);
};

export const stripPreviewUrls = (value = '') => repairSpacedUrlDomains(value)
  .replace(URL_CANDIDATE_PATTERN, '')
  .replace(/\s+/g, ' ')
  .trim();

const getFallback = (url) => {
  try {
    const parsed = new URL(normalizePreviewUrl(url));
    const encodedFilename = parsed.pathname.split('/').filter(Boolean).pop() || '';
    let filename = encodedFilename;
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch (_error) {
      // Keep the encoded filename when the URL contains a malformed escape.
    }
    const directImage = DIRECT_IMAGE_PATTERN.test(parsed.pathname) ? parsed.toString() : '';
    const youtubeVideoId = getYouTubeVideoId(parsed.toString());
    return {
      status: directImage || youtubeVideoId ? 'ok' : 'loading',
      kind: directImage ? 'image' : youtubeVideoId ? 'video' : 'page',
      url: parsed.toString(),
      host: parsed.hostname.replace(/^www\./i, ''),
      title: directImage && filename ? filename : youtubeVideoId ? 'YouTube video' : parsed.hostname.replace(/^www\./i, ''),
      description: '',
      image: directImage || (youtubeVideoId ? `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg` : ''),
      siteName: '',
      icon: '',
    };
  } catch (_error) {
    return { status: 'unavailable', kind: 'page', url, host: '', title: url, description: '', image: '', siteName: '', icon: '' };
  }
};

export default function LinkPreviewCard({ url, compact = false }) {
  const normalizedUrl = useMemo(() => normalizePreviewUrl(url), [url]);
  const [preview, setPreview] = useState(() => previewCache.get(normalizedUrl) || getFallback(normalizedUrl));
  const [loading, setLoading] = useState(!previewCache.has(normalizedUrl));
  const [imageFailed, setImageFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = previewCache.get(normalizedUrl);
    if (cached) {
      setPreview(cached);
      setLoading(false);
      return () => { active = false; };
    }
    setPreview(getFallback(normalizedUrl));
    setLoading(true);
    const load = async () => {
      try {
        const data = await loadLinkPreview(normalizedUrl);
        if (!active) return;
        const fallback = getFallback(normalizedUrl);
        const remoteTitle = String(data?.title || '').trim().toLowerCase();
        const remoteHost = String(data?.host || fallback.host || '').trim().toLowerCase();
        const hasMetadata = Boolean(
          data?.image || data?.description || data?.siteName || (remoteTitle && remoteTitle !== remoteHost)
        );
        const next = {
          status: data?.status || (hasMetadata || fallback.status === 'ok' ? 'ok' : 'unavailable'),
          kind: data?.kind || fallback.kind,
          url: data?.url || fallback.url,
          host: data?.host || fallback.host,
          title: data?.title || fallback.title,
          description: data?.description || fallback.description,
          image: data?.image || fallback.image,
          siteName: data?.siteName || fallback.siteName,
          icon: data?.icon || fallback.icon,
        };
        if (next.status === 'ok') previewCache.set(normalizedUrl, next);
        setPreview(next);
      } catch (_error) {
        if (active) {
          const fallback = getFallback(normalizedUrl);
          setPreview(fallback.status === 'ok' ? fallback : { ...fallback, status: 'unavailable' });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [normalizedUrl]);

  useEffect(() => {
    setImageFailed(false);
  }, [preview.image]);

  useEffect(() => {
    setIconFailed(false);
  }, [preview.icon]);

  const openUrl = preview.url || normalizedUrl;
  const youtubeVideoId = getYouTubeVideoId(openUrl);
  if (!loading && preview.status === 'unavailable') {
    return (
      <TouchableOpacity
        accessibilityLabel={`Відкрити ${preview.host || 'посилання'}`}
        activeOpacity={0.86}
        onPress={() => Linking.openURL(openUrl).catch(() => {})}
        style={styles.linkChip}
      >
        <MaterialIcons name="language" size={15} color="#4ea1ff" />
        <Text numberOfLines={1} style={styles.linkChipText}>{preview.host || normalizedUrl}</Text>
        <MaterialIcons name="open-in-new" size={17} color="#9aa3b2" />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      accessibilityLabel={`Відкрити ${preview.title || preview.host || 'посилання'}`}
      activeOpacity={0.86}
      onPress={() => Linking.openURL(openUrl).catch(() => {})}
      style={[styles.card, compact && styles.cardCompact]}
    >
      {!!preview.image && !imageFailed && !compact && (
        <View style={styles.imageContainer}>
          <Image
            onError={() => setImageFailed(true)}
            source={{ uri: preview.image }}
            resizeMode="cover"
            style={styles.image}
          />
          {!!youtubeVideoId && <MaterialIcons name="play-circle-filled" size={54} color="rgba(255,255,255,0.94)" style={styles.playIcon} />}
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.hostRow}>
          {!!preview.icon && !iconFailed ? (
            <Image onError={() => setIconFailed(true)} source={{ uri: preview.icon }} style={styles.siteIcon} />
          ) : (
            <MaterialIcons name="language" size={14} color="#4ea1ff" />
          )}
          <Text numberOfLines={1} style={styles.host}>{preview.host || normalizedUrl}</Text>
          {loading && <ActivityIndicator color="#4ea1ff" size="small" />}
        </View>
        <Text numberOfLines={2} style={styles.title}>{preview.title || normalizedUrl}</Text>
        {!!preview.description && <Text numberOfLines={2} style={styles.description}>{preview.description}</Text>}
      </View>
      <MaterialIcons name="open-in-new" size={18} color="#9aa3b2" style={styles.openIcon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#101f2c', borderColor: '#36516a', borderRadius: 14,
    borderWidth: 1, marginTop: 8, maxWidth: 330, minWidth: 240, overflow: 'hidden', position: 'relative',
  },
  cardCompact: { minWidth: 230 },
  linkChip: {
    alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#101f2c', borderColor: '#36516a',
    borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 8,
    maxWidth: 330, minHeight: 42, paddingHorizontal: 12,
  },
  linkChipText: { color: '#82c6ff', flexShrink: 1, fontSize: 12, fontWeight: '700' },
  imageContainer: { backgroundColor: '#1b2b3b', height: 132, position: 'relative', width: '100%' },
  image: { height: '100%', width: '100%' },
  playIcon: { alignSelf: 'center', position: 'absolute', top: 39 },
  content: { padding: 11, paddingRight: 36 },
  hostRow: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 17 },
  siteIcon: { borderRadius: 3, height: 14, width: 14 },
  host: { color: '#82c6ff', flexShrink: 1, fontSize: 11, fontWeight: '700' },
  title: { color: '#f4f7fb', fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 5 },
  description: { color: '#9aa3b2', fontSize: 12, lineHeight: 17, marginTop: 4 },
  openIcon: { position: 'absolute', right: 10, top: 11 },
});
