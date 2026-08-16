import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faYoutube } from '@fortawesome/free-brands-svg-icons';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DarkThemeColors as COLORS } from '../../constants/theme';
import {
  loadYouTubeChannelFeed,
  YOUTUBE_CHANNEL_HANDLE,
  YOUTUBE_CHANNEL_NAME,
  YOUTUBE_CHANNEL_URL,
} from './youtubeChannel';

const DATE_LOCALES = {
  be: 'be-BY',
  de: 'de-DE',
  en: 'en-GB',
  pl: 'pl-PL',
  ru: 'ru-RU',
  uk: 'uk-UA',
};

const formatPublishedAt = (value, language) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const locale = DATE_LOCALES[String(language || '').split('-')[0]] || 'uk-UA';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch (_error) {
    return date.toLocaleDateString();
  }
};

const formatViewCount = (value, language) => {
  if (!Number.isFinite(value)) return '';
  const locale = DATE_LOCALES[String(language || '').split('-')[0]] || 'uk-UA';
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch (_error) {
    return String(value);
  }
};

function VideoCard({ item, language, onPress }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const publishedAt = formatPublishedAt(item.publishedAt, language);
  const viewCount = formatViewCount(item.viewCount, language);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [item.thumbnail]);

  return (
    <TouchableOpacity
      accessibilityLabel={`Відкрити відео: ${item.title}`}
      activeOpacity={0.86}
      onPress={onPress}
      style={styles.videoCard}
    >
      <View style={styles.thumbnailContainer}>
        {!thumbnailFailed ? (
          <Image
            onError={() => setThumbnailFailed(true)}
            resizeMode="cover"
            source={{ uri: item.thumbnail }}
            style={styles.thumbnail}
          />
        ) : (
          <MaterialIcons name="ondemand-video" size={52} color={COLORS.textSecondary} />
        )}
        <View pointerEvents="none" style={styles.playBadge}>
          <MaterialIcons name="play-arrow" size={30} color="#fff" />
        </View>
      </View>
      <View style={styles.videoContent}>
        <Text numberOfLines={2} style={styles.videoTitle}>{item.title}</Text>
        {!!item.description && (
          <Text numberOfLines={2} style={styles.videoDescription}>{item.description}</Text>
        )}
        <View style={styles.videoMeta}>
          {!!publishedAt && <Text style={styles.metaText}>{publishedAt}</Text>}
          {!!publishedAt && !!viewCount && <View style={styles.metaDot} />}
          {!!viewCount && <Text style={styles.metaText}>{viewCount} переглядів</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function YouTubeVideosScreen({ navigation }) {
  const { i18n } = useTranslation();
  const mountedRef = useRef(true);
  const [channel, setChannel] = useState({
    title: YOUTUBE_CHANNEL_NAME,
    handle: YOUTUBE_CHANNEL_HANDLE,
    url: YOUTUBE_CHANNEL_URL,
  });
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadVideos = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const feed = await loadYouTubeChannelFeed({ force });
      if (!mountedRef.current) return;
      setChannel(feed.channel);
      setVideos(feed.videos);
      setLoadFailed(false);
    } catch (_error) {
      if (!mountedRef.current) return;
      setLoadFailed(true);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    const title = channel.title || YOUTUBE_CHANNEL_NAME;
    navigation.setOptions({ title });
    navigation.getParent()?.setOptions({ drawerLabel: title });
  }, [channel.title, navigation]);

  const openUrl = useCallback(async (url) => {
    try {
      await Linking.openURL(url);
    } catch (_error) {
      Alert.alert('Не вдалося відкрити посилання', 'Перевірте, чи доступний YouTube на цьому пристрої.');
    }
  }, []);

  if (loading && videos.length === 0) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.stateText}>Завантаження відео…</Text>
      </View>
    );
  }

  if (loadFailed && videos.length === 0) {
    return (
      <View style={styles.centerState}>
        <MaterialIcons name="cloud-off" size={48} color={COLORS.textSecondary} />
        <Text style={styles.stateText}>Не вдалося завантажити відео каналу.</Text>
        <TouchableOpacity onPress={() => loadVideos(true)} style={styles.retryButton}>
          <Text style={styles.retryText}>Повторити</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <FlatList
        contentContainerStyle={[styles.list, videos.length === 0 && styles.emptyList]}
        data={videos}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View>
            <TouchableOpacity
              accessibilityLabel={`Відкрити канал ${channel.title}`}
              activeOpacity={0.84}
              onPress={() => openUrl(channel.url || YOUTUBE_CHANNEL_URL)}
              style={styles.channelCard}
            >
              <FontAwesomeIcon icon={faYoutube} size={34} color="#ff334b" />
              <View style={styles.channelCopy}>
                <Text numberOfLines={1} style={styles.channelTitle}>{channel.title}</Text>
                <Text style={styles.channelHandle}>{channel.handle || YOUTUBE_CHANNEL_HANDLE}</Text>
              </View>
              <MaterialIcons name="open-in-new" size={21} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.listTitle}>Останні відео</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.stateText}>На каналі поки немає доступних відео.</Text>}
        refreshControl={(
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => loadVideos(true)}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        )}
        renderItem={({ item }) => (
          <VideoCard
            item={item}
            language={i18n.language}
            onPress={() => openUrl(item.url)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerState: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    flex: 1,
    justifyContent: 'center',
    padding: 30,
  },
  stateText: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 21, marginTop: 12, textAlign: 'center' },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: 10, marginTop: 16, paddingHorizontal: 20, paddingVertical: 11 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  list: { padding: 12, paddingBottom: 28 },
  emptyList: { flexGrow: 1 },
  channelCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  channelCopy: { flex: 1, marginHorizontal: 13, minWidth: 0 },
  channelTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  channelHandle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3 },
  listTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', marginBottom: 12, marginHorizontal: 2 },
  videoCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.surfaceElevated,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  thumbnail: { height: '100%', width: '100%' },
  playBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 45, 0.9)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    width: 44,
  },
  videoContent: { padding: 13 },
  videoTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  videoDescription: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 6 },
  videoMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', marginTop: 9 },
  metaText: { color: COLORS.textSecondary, fontSize: 12 },
  metaDot: { backgroundColor: COLORS.textSecondary, borderRadius: 2, height: 3, marginHorizontal: 7, width: 3 },
});
