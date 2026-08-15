import { MaterialIcons } from '@expo/vector-icons';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const previewCache = new Map();
const FUNCTIONS_REGION = 'europe-west1';

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

export const extractPreviewUrls = (value = '') => {
  const matches = String(value).match(/(?:https?:\/\/|www\.)[^\s<]+/gi) || [];
  return Array.from(new Set(matches.map((url) => normalizePreviewUrl(url.replace(/[),.!?;:]+$/g, ''))))).slice(0, 3);
};

const getFallback = (url) => {
  try {
    const parsed = new URL(normalizePreviewUrl(url));
    return { url: parsed.toString(), host: parsed.hostname.replace(/^www\./i, ''), title: parsed.hostname.replace(/^www\./i, ''), description: '', image: '' };
  } catch (_error) {
    return { url, host: '', title: url, description: '', image: '' };
  }
};

export default function LinkPreviewCard({ url, compact = false }) {
  const normalizedUrl = useMemo(() => normalizePreviewUrl(url), [url]);
  const [preview, setPreview] = useState(() => previewCache.get(normalizedUrl) || getFallback(normalizedUrl));
  const [loading, setLoading] = useState(!previewCache.has(normalizedUrl));

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
        const next = { ...getFallback(normalizedUrl), ...(data || {}) };
        previewCache.set(normalizedUrl, next);
        setPreview(next);
      } catch (_error) {
        // Metadata is optional: keep the domain fallback and never break chat rendering.
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [normalizedUrl]);

  const openUrl = preview.url || normalizedUrl;
  return (
    <TouchableOpacity
      accessibilityLabel={`Відкрити ${preview.title || preview.host || 'посилання'}`}
      activeOpacity={0.86}
      onPress={() => Linking.openURL(openUrl).catch(() => {})}
      style={[styles.card, compact && styles.cardCompact]}
    >
      {!!preview.image && !compact && <Image source={{ uri: preview.image }} resizeMode="cover" style={styles.image} />}
      <View style={styles.content}>
        <View style={styles.hostRow}>
          <MaterialIcons name="language" size={14} color="#4ea1ff" />
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
  image: { backgroundColor: '#1b2b3b', height: 132, width: '100%' },
  content: { padding: 11, paddingRight: 36 },
  hostRow: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 17 },
  host: { color: '#82c6ff', flexShrink: 1, fontSize: 11, fontWeight: '700' },
  title: { color: '#f4f7fb', fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 5 },
  description: { color: '#9aa3b2', fontSize: 12, lineHeight: 17, marginTop: 4 },
  openIcon: { position: 'absolute', right: 10, top: 11 },
});
