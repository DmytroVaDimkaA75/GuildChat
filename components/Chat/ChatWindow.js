// ChatWindow.js (оновлено: crash-fix + коректні превʼю pinned/quoted + pin/unpin логіка)
// ВАЖЛИВО: expo install react-native-webview

import { faYoutube } from '@fortawesome/free-brands-svg-icons';
import {
  faChartSimple,
  faCheck,
  faCheckDouble,
  faFileAlt,
  faPaperclip,
  faPaperPlane,
  faTableCellsLarge,
  faReply,
  faPen,
  faTrash,
  faCopy,
  faThumbtack,
  faEyeSlash,
  faXmark,
  faBold,
  faItalic,
  faStrikethrough,
  faUnderline,
  faShareNodes,
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faLink,
  faMicrophone,
  faPause,
  faPlay,
  faStop,
  faVolumeHigh,
  faVolumeXmark
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { format } from 'date-fns';
import { de, es, fr, ru, uk } from 'date-fns/locale';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  Clipboard,
  Share,
  TouchableWithoutFeedback,
  useWindowDimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, MenuOption, MenuOptions, MenuProvider, MenuTrigger } from 'react-native-popup-menu';
import uuid from 'react-native-uuid';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import DatePicker from 'react-native-date-picker';
import moment from 'moment-timezone';
import translateMessage from '../../translateMessage';
import CalendarclockIcon from '../ico/calendarclock.svg';
import ClockIcon from '../ico/clock.svg';
import TransleteIcon from '../ico/translete.svg';
import UsercheckIcon from '../ico/usercheck.svg';
import { getPresenceStatusLabel } from './presenceUtils';

const WAVEFORM_BAR_COUNT = 60;
const WAVEFORM_MIN_HEIGHT = 2;
const WAVEFORM_MAX_HEIGHT = 28;
const WAVEFORM_MIN_DB = -80;
const WAVEFORM_GAMMA = 1.4;
const WAVEFORM_GRID_LINES = [0.2, 0.4, 0.6, 0.8];
const locales = { uk, ru, es, fr, de };

const INPUT_LINE_HEIGHT = 20;
const INPUT_VERTICAL_PADDING = 8;
const INPUT_MAX_LINES = 5;
const MIN_INPUT_HEIGHT = INPUT_LINE_HEIGHT + INPUT_VERTICAL_PADDING;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * INPUT_MAX_LINES + INPUT_VERTICAL_PADDING;

const isYouTubeURL = (url) => (url || '').includes('youtube.com') || (url || '').includes('youtu.be');
const isDocsURL = (url) => (url || '').includes('docs.google.com');

const getDocsIcon = (url) => {
  if (!url) return null;
  if (url.includes('/document/')) return faFileAlt;
  if (url.includes('/spreadsheets/')) return faTableCellsLarge;
  if (url.includes('/presentation/')) return faChartSimple;
  return faLink;
};

const normalizeUrl = (u) => {
  const url = String(u || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
};

const extractUrlsFromHtml = (html = '') => {
  if (!html) return [];
  const out = [];
  const regex = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) out.push(match[1]);
  return Array.from(new Set(out));
};

const extractUrlsFromText = (text = '') => {
  if (!text) return [];
  const regex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}[^\s]*)/gi;
  const found = String(text).match(regex) || [];
  // нормалізуємо (щоб youtu.be без схеми став валідним)
  return Array.from(new Set(found.map((u) => normalizeUrl(u))));
};

const stripUrls = (text = '') => {
  if (!text) return '';
  return String(text).replace(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}[^\s]*)/gi, '').trim();
};

const stripHtml = (html = '') =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatDuration = (durationMillis = 0) => {
  const totalSeconds = Math.max(0, Math.round(durationMillis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const buildWaveform = (meterings = [], barCount = WAVEFORM_BAR_COUNT) => {
  const clean = meterings.filter((value) => Number.isFinite(value));
  if (!clean.length) return [];
  const chunkSize = Math.max(1, Math.floor(clean.length / barCount));
  const waveform = [];
  for (let i = 0; i < barCount; i += 1) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, clean.length);
    const chunk = clean.slice(start, end);
    const peak = chunk.length ? Math.max(...chunk) : clean[clean.length - 1];
    const normalized = Math.max(0, Math.min(1, (peak - WAVEFORM_MIN_DB) / (0 - WAVEFORM_MIN_DB)));
    const emphasized = Math.pow(normalized, WAVEFORM_GAMMA);
    waveform.push(Number.isFinite(emphasized) ? emphasized : 0);
  }
  return waveform;
};

const getWaveformBars = (waveform) => {
  if (Array.isArray(waveform) && waveform.length) return waveform;
  return Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.1);
};

const getHostLabel = (url = '') => {
  try {
    const u = new URL(normalizeUrl(url));
    return u.host || url;
  } catch (e) {
    return url;
  }
};

const SendOptionsPopup = ({ visible, chatType, onClose, onSendLater, onSendToSelected }) => {
  if (!visible) return null;
  return (
    <TouchableOpacity activeOpacity={1} style={styles.sendOptionsOverlay} onPress={onClose}>
      <View style={styles.sendOptionsPopup}>
        <TouchableOpacity
          style={styles.sendOptionButton}
          onPress={() => {
            onSendLater();
            onClose();
          }}
        >
          <View style={styles.sendOptionContent}>
            <CalendarclockIcon width={20} height={20} fill="#9aa0a6" style={{ marginRight: 8 }} />
            <Text style={styles.sendOptionText}>Надіслати пізніше</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sendOptionButton}
          onPress={() => {
            onSendLater();
            onClose();
          }}
        >
          <View style={styles.sendOptionContent}>
            <ClockIcon width={20} height={20} fill="#9aa0a6" style={{ marginRight: 8 }} />
            <Text style={styles.sendOptionText}>Тимчасове повідомлення</Text>
          </View>
        </TouchableOpacity>
        {chatType === 'group' && (
          <TouchableOpacity
            style={styles.sendOptionButton}
            onPress={() => {
              onSendToSelected();
              onClose();
            }}
          >
            <View style={styles.sendOptionContent}>
              <UsercheckIcon width={20} height={20} fill="#9aa0a6" style={{ marginRight: 8 }} />
              <Text style={styles.sendOptionText}>Надіслати обраним</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

// --- захист від битих timestamp (щоб не ловити "Invalid time value") ---
const safeDate = (ts) => {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date();
  return new Date(n);
};

const safeFormat = (ts, fmt, locale) => {
  try {
    return format(safeDate(ts), fmt, locale ? { locale } : undefined);
  } catch (e) {
    return '';
  }
};

// --------------------
// Rich Text Web Input (WebView + contenteditable)
// --------------------
const RichTextWebInput = React.forwardRef(function RichTextWebInput(
  { placeholder = 'Повідомлення...', minHeight = 40, maxHeight = 100, onChange },
  ref
) {
  const webRef = React.useRef(null);
  const [height, setHeight] = React.useState(minHeight);

  const inject = React.useCallback((js) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      cmd: (c) => inject(`window.__cmd && window.__cmd(${JSON.stringify(c)})`),
      spoiler: () => inject(`window.__wrapSpoiler && window.__wrapSpoiler()`),
      link: (url) => inject(`window.__createLink && window.__createLink(${JSON.stringify(url)})`),
      replaceRange: (start, end, text) =>
        inject(
          `window.__replaceRange && window.__replaceRange(${Number(start) || 0}, ${Number(end) || 0}, ${JSON.stringify(
            text || ''
          )})`
        ),
      clear: () => {
        setHeight(minHeight);
        inject(`window.__clear && window.__clear()`);
      },
      focus: () => inject(`window.__focus && window.__focus()`)
    }),
    [inject, minHeight]
  );

  const editorHTML = React.useMemo(() => {
    const safePlaceholder = String(placeholder).replace(/"/g, '&quot;');

    return `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
  <style>
    body { margin:0; padding:0; background: transparent; }
    #editor {
      padding: ${INPUT_VERTICAL_PADDING / 2}px 6px;
      font-size: 16px;
      line-height: ${INPUT_LINE_HEIGHT}px;
      outline: none;
      min-height: ${minHeight}px;
      max-height: ${maxHeight}px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-y: auto;
    }
    #editor:empty:before {
      content: attr(data-placeholder);
      color: #666;
    }
    .spoiler {
      background: rgba(255,255,255,0.12);
      color: transparent;
      border-radius: 4px;
      padding: 0 2px;
    }
    .spoiler.revealed {
      color: inherit;
      background: rgba(255,255,255,0.08);
    }
    a { color: #3498db; text-decoration: underline; }
  </style>
</head>
<body>
  <div id="editor" contenteditable="true" spellcheck="true" data-placeholder="${safePlaceholder}"></div>

  <script>
    const editor = document.getElementById('editor');

    function post(type, payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    }

    function nodeToMarked(node) {
      if (!node) return '';
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';

      const tag = (node.tagName || '').toLowerCase();
      if (tag === 'br') return '\\n';

      let inner = '';
      const children = node.childNodes ? Array.from(node.childNodes) : [];
      for (const ch of children) inner += nodeToMarked(ch);

      if (tag === 'div' || tag === 'p') return inner + '\\n';

      if (tag === 'b' || tag === 'strong') return '**' + inner + '**';
      if (tag === 'i' || tag === 'em') return '_' + inner + '_';
      if (tag === 'u') return '__' + inner + '__';
      if (tag === 's' || tag === 'del' || tag === 'strike') return '~~' + inner + '~~';

      if (tag === 'span' && node.classList && node.classList.contains('spoiler')) {
        return '||' + inner + '||';
      }

      if (tag === 'a') return inner;
      return inner;
    }

    function selectionActiveInEditor() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return false;
      const node = sel.anchorNode;
      if (!node) return false;
      return editor.contains(node);
    }

    function getCaretIndex() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return 0;
      const range = sel.getRangeAt(0);
      if (!editor.contains(range.endContainer)) return 0;
      const preRange = range.cloneRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.endContainer, range.endOffset);
      return preRange.toString().length;
    }

    function notifyChange() {
      const html = editor.innerHTML || '';
      const text = editor.innerText || '';
      let marked = nodeToMarked(editor) || '';
      marked = marked.replace(/\\n{3,}/g, '\\n\\n').trimEnd();

      const h = Math.max(${minHeight}, Math.min(${maxHeight}, (editor.scrollHeight || ${minHeight})));
      const selActive = selectionActiveInEditor();
      const caretIndex = getCaretIndex();

      post('change', { html, text, marked, height: h, selActive, caretIndex });
    }

    window.__cmd = (c) => {
      try { document.execCommand(c, false, null); } catch(e) {}
      notifyChange();
    };

    window.__wrapSpoiler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;

      const span = document.createElement('span');
      span.className = 'spoiler';
      try { range.surroundContents(span); } catch(e) {}
      notifyChange();
    };

    window.__createLink = (url) => {
      const u = (url || '').trim();
      if (!u) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        editor.appendChild(document.createTextNode(u));
        notifyChange();
        return;
      }

      const range = sel.getRangeAt(0);

      if (range.collapsed) {
        const a = document.createElement('a');
        a.href = u;
        a.textContent = u;
        range.insertNode(a);
        range.setStartAfter(a);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        notifyChange();
        return;
      }

      try { document.execCommand('createLink', false, u); } catch(e) {}
      notifyChange();
    };

    window.__replaceRange = (start, end, text) => {
      const value = String(text || '');
      const s = Math.max(0, Number(start) || 0);
      const e = Math.max(s, Number(end) || 0);

      const range = document.createRange();
      let charIndex = 0;
      let foundStart = false;
      const iterator = document.createNodeIterator(editor, NodeFilter.SHOW_TEXT);
      let node;

      while ((node = iterator.nextNode())) {
        const nextIndex = charIndex + (node.nodeValue || '').length;
        if (!foundStart && s <= nextIndex) {
          range.setStart(node, s - charIndex);
          foundStart = true;
        }
        if (foundStart && e <= nextIndex) {
          range.setEnd(node, e - charIndex);
          break;
        }
        charIndex = nextIndex;
      }

      if (!foundStart) {
        editor.appendChild(document.createTextNode(value));
        notifyChange();
        return;
      }

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { document.execCommand('insertText', false, value); } catch(e) {}
      notifyChange();
    };

    window.__clear = () => {
      editor.innerHTML = '';
      notifyChange();
    };

    window.__focus = () => {
      try { editor.focus(); } catch(e) {}
    };

    editor.addEventListener('input', notifyChange);
    editor.addEventListener('keyup', notifyChange);
    editor.addEventListener('paste', () => setTimeout(notifyChange, 0));
    document.addEventListener('selectionchange', () => notifyChange());

    editor.addEventListener('click', (e) => {
      const sp = e.target && e.target.closest ? e.target.closest('.spoiler') : null;
      if (sp) {
        sp.classList.toggle('revealed');
        e.preventDefault();
        notifyChange();
      }
      const a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (a) e.preventDefault();
    });

    setTimeout(() => { window.__focus(); notifyChange(); }, 50);
  </script>
</body>
</html>`;
  }, [placeholder, minHeight, maxHeight]);

  const onMessage = React.useCallback(
    (event) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data && data.type === 'change') {
          const h = Number(data.height);
          if (!Number.isNaN(h)) setHeight(h);
          onChange &&
            onChange({
              html: data.html || '',
              text: data.text || '',
              marked: data.marked || '',
              selectionActive: !!data.selActive,
              caretIndex: Number.isFinite(Number(data.caretIndex)) ? Number(data.caretIndex) : 0
            });
        }
      } catch (e) {}
    },
    [onChange]
  );

  return (
    <View style={{ height }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: editorHTML }}
        onMessage={onMessage}
        scrollEnabled={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView={true}
        style={{ backgroundColor: 'transparent', height }}
      />
    </View>
  );
});

// --- Спойлер ---
const Spoiler = ({ children }) => {
  const [visible, setVisible] = useState(false);
  return (
    <Text
      onPress={() => setVisible((prev) => !prev)}
      style={[styles.spoilerText, !visible && styles.spoilerHiddenText]}
    >
      {children}
    </Text>
  );
};

const parseMentions = (text) => {
  if (!text) return [];
  const parts = [];
  const regex = /@([a-z0-9_.-]+(?:\s+[a-z0-9_.-]+)*)/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'normal', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'mention', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push({ type: 'normal', content: text.slice(lastIndex) });
  return parts;
};

const parseFormattedText = (text) => {
  const parts = [];
  let lastIndex = 0;

  const regex = /(\*\*(.*?)\*\*|__(.*?)__|_([^_]+)_|~~(.*?)~~|\|\|(.*?)\|\|)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'normal', content: parseMentions(text.slice(lastIndex, match.index)) });
    }
    const matchedContent = match[2] || match[3] || match[4] || match[5] || match[6];
    let type = 'normal';

    if (match[2]) type = 'bold';
    else if (match[3]) type = 'underline';
    else if (match[4]) type = 'italic';
    else if (match[5]) type = 'strikethrough';
    else if (match[6]) type = 'spoiler';

    parts.push({ type, content: parseFormattedText(matchedContent) });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push({ type: 'normal', content: parseMentions(text.slice(lastIndex)) });
  return parts;
};

const buildTextStyle = (activeStyles = []) => {
  const style = {};
  if (activeStyles.includes('bold')) style.fontWeight = 'bold';
  if (activeStyles.includes('italic')) style.fontStyle = 'italic';

  const underline = activeStyles.includes('underline');
  const strikethrough = activeStyles.includes('strikethrough');

  if (underline && strikethrough) style.textDecorationLine = 'underline line-through';
  else if (underline) style.textDecorationLine = 'underline';
  else if (strikethrough) style.textDecorationLine = 'line-through';

  return style;
};

const buildMentionTextStyle = (activeStyles = []) => {
  const style = buildTextStyle(activeStyles);
  const decoration = style.textDecorationLine;

  if (!decoration) {
    style.textDecorationLine = 'underline';
  } else if (!decoration.includes('underline')) {
    style.textDecorationLine = decoration.includes('line-through') ? 'underline line-through' : `${decoration} underline`;
  }

  return style;
};

const renderFormattedParts = (parts, activeStyles = [], keyPrefix = '') =>
  parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.type === 'spoiler') {
      const contentParts = Array.isArray(part.content) ? part.content : [{ type: 'normal', content: part.content }];
      return <Spoiler key={key}>{renderFormattedParts(contentParts, activeStyles, key)}</Spoiler>;
    }

    if (part.type === 'mention') {
      return (
        <Text key={key} style={[styles.mentionText, buildMentionTextStyle(activeStyles)]}>
          {part.content}
        </Text>
      );
    }

    const newActiveStyles = part.type === 'normal' ? activeStyles : [...activeStyles, part.type];
    const textStyle = buildTextStyle(newActiveStyles);
    const children = Array.isArray(part.content) ? renderFormattedParts(part.content, newActiveStyles, key) : part.content;

    return (
      <Text key={key} style={textStyle}>
        {children}
      </Text>
    );
  });

const FormattedText = ({ text }) => {
  const parts = parseFormattedText(text || '');
  return <Text style={styles.messageText}>{renderFormattedParts(parts)}</Text>;
};

// ---- кеш для метаданих лінків (щоб не робити зайвих запитів) ----
const __linkMetaCache = new Map();

const useLinkMeta = (url) => {
  const [meta, setMeta] = useState(() => {
    const key = String(url || '');
    return __linkMetaCache.get(key) || null;
  });

  useEffect(() => {
    const u = String(url || '');
    if (!u) return;

    const cached = __linkMetaCache.get(u);
    if (cached) {
      setMeta(cached);
      return;
    }

    let alive = true;

    const run = async () => {
      try {
        const res = await fetch(u);
        const html = await res.text();

        if (!alive) return;

        const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || '';
        const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1] || '';
        const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1] || '';
        const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || '';

        const data = {
          title: (ogTitle || title || '').trim(),
          description: (ogDesc || '').trim(),
          image: (ogImage || '').trim()
        };

        __linkMetaCache.set(u, data);
        setMeta(data);
      } catch (e) {
        if (!alive) return;
        const fallback = { title: '', description: '', image: '' };
        __linkMetaCache.set(u, fallback);
        setMeta(fallback);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [url]);

  return meta;
};

const LinkPreviewCard = ({ url }) => {
  const [previewData, setPreviewData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPreview = async () => {
      try {
        const res = await fetch(url);
        const html = await res.text();
        if (!isMounted) return;

        const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || url;
        const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
        const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1];
        const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];

        setPreviewData({
          title: (ogTitle || title || url).trim(),
          description: isYouTubeURL(url) ? '' : (ogDesc || '').trim(),
          image: isYouTubeURL(url) ? null : ogImage || null
        });
      } catch (e) {
        if (isMounted) setPreviewData({ title: url, description: '', image: null });
      }
    };
    fetchPreview();
    return () => {
      isMounted = false;
    };
  }, [url]);

  if (!previewData)
    return (
      <Text style={{ color: '#3498db', textDecorationLine: 'underline' }} onPress={() => Linking.openURL(url)}>
        {url}
      </Text>
    );

  const badgeIcon = isYouTubeURL(url) ? faYoutube : isDocsURL(url) ? getDocsIcon(url) : faLink;

  return (
    <TouchableOpacity style={styles.linkPreviewContainer} onPress={() => Linking.openURL(url)} activeOpacity={0.9}>
      {previewData.image && <Image source={{ uri: previewData.image }} style={styles.linkPreviewImage} resizeMode="cover" />}

      <View style={styles.linkPreviewTextContainer}>
        <Text style={styles.linkPreviewTitle} numberOfLines={1}>
          {previewData.title}
        </Text>
        {previewData.description ? (
          <Text style={styles.linkPreviewDescription} numberOfLines={2}>
            {previewData.description}
          </Text>
        ) : null}
      </View>

      {/* ✅ монохромна іконка */}
      <View style={styles.mediaIconBadgeMono}>
        <FontAwesomeIcon icon={badgeIcon} size={14} color="#FFF" />
      </View>
    </TouchableOpacity>
  );
};

const InterlocutorAvatar = ({ senderId, guildId }) => {
  const [avatar, setAvatar] = useState(null);
  useEffect(() => {
    if (senderId && guildId) {
      const ref = database().ref(`guilds/${guildId}/guildUsers/${senderId}/imageUrl`);
      const listener = ref.on('value', (snap) => setAvatar(snap.val()));
      return () => ref.off('value', listener);
    }
  }, [senderId, guildId]);
  if (!avatar) return <View style={[styles.interlocutorAvatar, { backgroundColor: '#444' }]} />;
  return <Image source={{ uri: avatar }} style={styles.interlocutorAvatar} />;
};

const ReadUserInline = ({ userId, guildId, maxLength = 12 }) => {
  const [info, setInfo] = useState({ name: '', avatar: '' });

  useEffect(() => {
    if (userId && guildId) {
      database()
        .ref(`guilds/${guildId}/guildUsers/${userId}`)
        .once('value')
        .then((snap) => {
          const data = snap.val() || {};
          setInfo({ name: data.userName || '', avatar: data.imageUrl || '' });
        })
        .catch(() => {});
    }
  }, [userId, guildId]);

  const displayName = info.name.length > maxLength ? `${info.name.slice(0, maxLength)}…` : info.name;

  return (
    <>
      <Text style={styles.readUserName}>{displayName}</Text>
      {info.avatar ? <Image source={{ uri: info.avatar }} style={styles.readUserAvatar} /> : null}
    </>
  );
};

const ReadUserRow = ({ userId, guildId }) => {
  const [info, setInfo] = useState({ name: '', avatar: '' });

  useEffect(() => {
    if (userId && guildId) {
      database()
        .ref(`guilds/${guildId}/guildUsers/${userId}`)
        .once('value')
        .then((snap) => {
          const data = snap.val() || {};
          setInfo({ name: data.userName || '', avatar: data.imageUrl || '' });
        })
        .catch(() => {});
    }
  }, [userId, guildId]);

  const displayName = info.name.length > 20 ? `${info.name.slice(0, 20)}…` : info.name;

  return (
    <View style={styles.readUserRow}>
      <Text style={styles.readUserName}>{displayName}</Text>
      {info.avatar ? <Image source={{ uri: info.avatar }} style={styles.readUserAvatar} /> : null}
    </View>
  );
};

const ReadUsersPopup = ({ message, guildId, isCurrentUser, onClose }) => {
  if (!message || !message.readBy) return null;

  const entries = Object.entries(message.readBy)
    .filter(([id]) => id !== message.senderId)
    .sort((a, b) => a[1] - b[1]);

  if (entries.length <= 1) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.popupOverlay}>
        <View
          style={[
            styles.readUsersPopup,
            isCurrentUser ? styles.readUsersPopupPersonal : styles.readUsersPopupInterlocutor
          ]}
        >
          <ScrollView>
            {entries.map(([uid]) => (
              <ReadUserRow key={uid} userId={uid} guildId={guildId} />
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const UserInfoPopup = ({ visible, user, loading, onClose }) => {
  if (!visible) return null;

  const displayName = loading ? 'Завантаження…' : user?.name || 'Невідомий користувач';
  const displayCity = loading ? '' : user?.city ? `Місто: ${user.city}` : 'Місто не вказано';

  return (
    <Modal transparent animationType="fade" visible>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.popupOverlay}>
        <View style={styles.userInfoPopup}>
          <Text style={styles.userInfoName}>{displayName}</Text>
          {!!displayCity && <Text style={styles.userInfoCity}>{displayCity}</Text>}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const SenderName = ({ senderId, currentUserId, guildId }) => {
  const [name, setName] = useState('');
  useEffect(() => {
    if (senderId !== currentUserId && guildId) {
      const ref = database().ref(`guilds/${guildId}/guildUsers/${senderId}/userName`);
      const listener = ref.on('value', (snap) => setName(snap.val() || ''));
      return () => ref.off('value', listener);
    }
  }, [senderId, currentUserId, guildId]);
  if (!name || senderId === currentUserId) return null;
  return <Text style={styles.senderName}>{name}</Text>;
};

// --------- Компактне превʼю повідомлення (для pinned/quoted) ---------
const CompactMessagePreview = ({ message, lines = 1 }) => {
  const text = String(message?.text || '');
  const html = String(message?.html || '');
  const hasImage = Array.isArray(message?.imageUrls) && message.imageUrls.length > 0;
  const hasAudio = !!message?.audioUrl;

  const urls = useMemo(() => {
    const a = extractUrlsFromText(text);
    const b = extractUrlsFromHtml(html);
    const out = [...a, ...b].filter(Boolean);
    return Array.from(new Set(out));
  }, [text, html]);

  const firstUrl = urls[0] || '';
  const meta = useLinkMeta(firstUrl);
  const cleaned = stripUrls(text);

  const linkTypeIcon = isYouTubeURL(firstUrl) ? faYoutube : isDocsURL(firstUrl) ? getDocsIcon(firstUrl) : faLink;

  const titleForLink = (() => {
    if (cleaned) return cleaned;
    const t = (meta?.title || '').trim();
    if (t) return t;
    return getHostLabel(firstUrl);
  })();

  // ✅ якщо є фото — показуємо мініатюру завжди (а не просто "Фото")
  if (hasImage) {
    const thumb = message.imageUrls[0];
    const label = cleaned || (firstUrl ? titleForLink : 'Фото');
    return (
      <View style={styles.compactPreviewRow}>
        <Image source={{ uri: thumb }} style={styles.compactThumb} />
        <Text style={styles.compactPreviewText} numberOfLines={lines} ellipsizeMode="tail">
          {label}
        </Text>
      </View>
    );
  }

  if (hasAudio) {
    return (
      <View style={styles.compactPreviewRow}>
        <FontAwesomeIcon icon={faMicrophone} size={14} color="#cfcfcf" style={{ marginRight: 8 }} />
        <Text style={styles.compactPreviewText} numberOfLines={lines} ellipsizeMode="tail">
          Голосове повідомлення
        </Text>
      </View>
    );
  }

  // ✅ якщо є лінк — показуємо монохромну іконку + заголовок (НЕ "Посилання", НЕ "youtu.be")
  if (firstUrl) {
    return (
      <View style={styles.compactPreviewRow}>
        <FontAwesomeIcon icon={linkTypeIcon} size={14} color="#cfcfcf" style={{ marginRight: 8 }} />
        <Text style={styles.compactPreviewText} numberOfLines={lines} ellipsizeMode="tail">
          {titleForLink}
        </Text>
      </View>
    );
  }

  // ✅ чистий текст — без іконки
  if (cleaned) {
    return (
      <Text style={styles.compactPreviewText} numberOfLines={lines} ellipsizeMode="tail">
        {cleaned}
      </Text>
    );
  }

  return (
    <Text style={styles.compactPreviewText} numberOfLines={lines} ellipsizeMode="tail">
      Медіа
    </Text>
  );
};

// --- Quoted (клікабельний) ---
const QuotedMessage = ({ replyTo, guildId, chatId, minimal = false, onPress }) => {
  const [quoted, setQuoted] = useState(null);

  useEffect(() => {
    if (replyTo && guildId && chatId) {
      database()
        .ref(`guilds/${guildId}/chats/${chatId}/messages/${replyTo}`)
        .once('value')
        .then((snap) => snap.exists() && setQuoted(snap.val()));
    }
  }, [replyTo, guildId, chatId]);

  if (!quoted) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress && onPress(replyTo)}
      style={[styles.quotedContainer, minimal && styles.quotedMinimal]}
    >
      <View style={styles.quotedLine} />
      <View style={styles.quotedContent}>
        <Text style={styles.quotedTitle} numberOfLines={1}>
          Відповідь
        </Text>

        {/* ✅ без "скріпки", без "Посилання", показуємо нормальне превʼю */}
        <CompactMessagePreview message={quoted} lines={2} />
      </View>
    </TouchableOpacity>
  );
};

// --- Модалка Просмотра (Зум + Шер) ---
const ImageViewerModal = ({ visible, uri, onClose }) => {
  const [scale, setScale] = useState(1);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const lastTap = useRef(null);

  useEffect(() => {
    if (visible) setScale(1);
  }, [visible]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: Platform.OS === 'android' ? uri : undefined,
        url: uri
      });
    } catch (error) {}
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (lastTap.current && now - lastTap.current < DOUBLE_PRESS_DELAY) {
      setScale((prev) => (prev > 1 ? 1 : 2));
    } else {
      lastTap.current = now;
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.imageViewerContainer}>
        <SafeAreaView style={styles.imageViewerHeader}>
          <TouchableOpacity onPress={onClose} style={styles.imageViewerBtn}>
            <FontAwesomeIcon icon={faXmark} size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity
              onPress={() => setScale((prev) => (prev > 1 ? 1 : 2))}
              style={[styles.imageViewerBtn, { marginRight: 10 }]}
            >
              <FontAwesomeIcon icon={scale > 1 ? faMagnifyingGlassMinus : faMagnifyingGlassPlus} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.imageViewerBtn}>
              <FontAwesomeIcon icon={faShareNodes} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ScrollView
            style={styles.imageScrollView}
            contentContainerStyle={styles.imageScrollContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            centerContent={true}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            scrollEnabled={Platform.OS === 'ios'}
          >
            <TouchableWithoutFeedback onPress={handleDoubleTap}>
              <Image
                source={{ uri }}
                style={[styles.fullScreenImage, { width: windowWidth, height: windowHeight }, Platform.OS === 'android' && { transform: [{ scale: scale }] }]}
                resizeMode="contain"
              />
            </TouchableWithoutFeedback>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const ChatWindow = ({ route, navigation }) => {
  const { chatId } = route.params || {};
  const { width: windowWidth } = useWindowDimensions();
  const [groups, setGroups] = useState([]); // групи по датах

  useEffect(() => {
    if (!chatId) return;
    const clearChatNotifications = async () => {
      try {
        const displayed = await notifee.getDisplayedNotifications();
        const chatNotifications = displayed.filter(({ notification }) => {
          const type = notification?.data?.type;
          const notificationChatId = notification?.data?.chatId;
          return type === 'chat_message' && String(notificationChatId) === String(chatId);
        });

        await Promise.all(
          chatNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
        );
      } catch (error) {
        console.log('❌ Помилка очищення пушів чату:', error?.message || String(error));
      }
    };

    clearChatNotifications();
  }, [chatId]);
  const [chatType, setChatType] = useState('private');
  const [headerUserId, setHeaderUserId] = useState(null);
  const [headerUser, setHeaderUser] = useState(null);
  const [groupHeader, setGroupHeader] = useState({ name: '', groupAvatar: null, memberCount: 0 });

  const [newMessage, setNewMessage] = useState('');
  const [newMessagePlain, setNewMessagePlain] = useState('');
  const [newMessageHtml, setNewMessageHtml] = useState('');
  const [composerSelectionActive, setComposerSelectionActive] = useState(false);
  const [composerCaretIndex, setComposerCaretIndex] = useState(0);
  const composerRef = useRef(null);

  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);

  const [userId, setUserId] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [locale, setLocale] = useState(uk);
  const [localeCode, setLocaleCode] = useState('uk');
  const [isChatMember, setIsChatMember] = useState(false);
  const [isChatSoundEnabled, setIsChatSoundEnabled] = useState(true);
  const isChatMemberRef = useRef(false);
  const isChatSoundEnabledRef = useRef(true);

  const [selectedImageUris, setSelectedImageUris] = useState([]);
  const [imageCaption, setImageCaption] = useState('');
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [audioPlaybackState, setAudioPlaybackState] = useState({ id: null, position: 0, duration: 0 });

  const [fullSizeImageUri, setFullSizeImageUri] = useState(null);
  const [fullSizeImageModalVisible, setFullSizeImageModalVisible] = useState(false);

  const [replyToMessage, setReplyToMessage] = useState(null);

  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [unpinModalVisible, setUnpinModalVisible] = useState(false);
  const [messageToPin, setMessageToPin] = useState(null);

  const [readUsersPopupFor, setReadUsersPopupFor] = useState(null);

  const [translationModalVisible, setTranslationModalVisible] = useState(false);
  const [translatedText, setTranslatedText] = useState('');

  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [sendOptionsPopupVisible, setSendOptionsPopupVisible] = useState(false);

  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const [guildMembers, setGuildMembers] = useState([]);
  const [mentionStartIndex, setMentionStartIndex] = useState(null);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);

  const [userInfoPopupVisible, setUserInfoPopupVisible] = useState(false);
  const [userInfoPopupUser, setUserInfoPopupUser] = useState(null);
  const [userInfoPopupLoading, setUserInfoPopupLoading] = useState(false);

  // highlight
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const highlightTimerRef = useRef(null);

  const flatListRef = useRef(null);
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const recordingMeteringsRef = useRef([]);
  const processedRead = useRef(new Set());
  const insets = useSafeAreaInsets();

  const handleToggleChatSound = useCallback(async () => {
    if (!chatId || !guildId || !userId || !isChatMemberRef.current) return;
    await database()
      .ref(`guilds/${guildId}/chats/${chatId}/members/${userId}`)
      .set(!isChatSoundEnabledRef.current);
  }, [chatId, guildId, userId]);

  const renderHeaderRight = useCallback(
    () =>
      isChatMember ? (
        <TouchableOpacity onPress={handleToggleChatSound} style={styles.headerSoundButton}>
          <FontAwesomeIcon icon={isChatSoundEnabled ? faVolumeHigh : faVolumeXmark} size={20} color="#fff" />
        </TouchableOpacity>
      ) : null,
    [handleToggleChatSound, isChatMember, isChatSoundEnabled]
  );

  const handleOpenUserInfo = useCallback(async (targetUserId) => {
    if (!targetUserId) return;
    setUserInfoPopupLoading(true);
    setUserInfoPopupVisible(true);
    try {
      const snap = await database().ref(`users/${targetUserId}`).once('value');
      const data = snap.val() || {};
      setUserInfoPopupUser({
        name: data.name || '',
        city: data.city || ''
      });
    } catch (error) {
      setUserInfoPopupUser({ name: '', city: '' });
    } finally {
      setUserInfoPopupLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const stopPlayback = useCallback(async () => {
    if (audioPlaybackRef.current) {
      await audioPlaybackRef.current.unloadAsync();
      audioPlaybackRef.current = null;
    }
    setPlayingAudioId(null);
    setAudioPlaybackState({ id: null, position: 0, duration: 0 });
  }, []);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      stopPlayback().catch(() => {});
    };
  }, [stopPlayback]);

  useEffect(() => {
    (async () => {
      const uid = await AsyncStorage.getItem('userId');
      const gid = await AsyncStorage.getItem('guildId');
      setUserId(uid);
      setGuildId(gid);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    const ref = database().ref(`users/${userId}/setting/language`);
    const listener = ref.on('value', (snap) => {
      const code = snap.val() || 'uk';
      setLocaleCode(code);
      setLocale(locales[code] || uk);
    });
    return () => ref.off('value', listener);
  }, [userId]);

  useEffect(() => {
    if (!chatId || !guildId || !userId) return;

    const chatRef = database().ref(`guilds/${guildId}/chats/${chatId}`);
    const listener = chatRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      setChatType(data.type || 'private');
      const members = data.members || {};
      const hasMember = Object.prototype.hasOwnProperty.call(members, userId);
      const soundEnabled = members?.[userId] === true;
      isChatMemberRef.current = hasMember;
      isChatSoundEnabledRef.current = soundEnabled;
      setIsChatMember(hasMember);
      setIsChatSoundEnabled(soundEnabled);
      if (data.type === 'private') {
        const otherId = Object.keys(data.members || {}).find((id) => id !== userId);
        if (otherId) {
          setHeaderUserId(otherId);
        }
      } else {
        setHeaderUserId(null);
        setGroupHeader({
          name: data.name || '',
          groupAvatar: data.groupAvatar || null,
          memberCount: Object.keys(data.members || {}).length
        });
      }
    });

    return () => chatRef.off('value', listener);
  }, [chatId, guildId, userId]);

  useEffect(() => {
    if (!guildId || !headerUserId) {
      setHeaderUser(null);
      return;
    }

    const userRef = database().ref(`guilds/${guildId}/guildUsers/${headerUserId}`);
    const listener = userRef.on('value', (snap) => {
      setHeaderUser(snap.val() || null);
    });

    return () => userRef.off('value', listener);
  }, [guildId, headerUserId]);

  useEffect(() => {
    if (chatType === 'private') {
      if (!headerUser || !headerUserId) return;
      const presenceLabel = getPresenceStatusLabel(headerUser.presence, locale);
      navigation.setOptions({
        headerTitle: () => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleOpenUserInfo(headerUserId)}
            style={styles.headerTitleContainer}
          >
            {headerUser.imageUrl ? (
              <Image source={{ uri: headerUser.imageUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, { backgroundColor: '#555' }]}>
                <Text style={{ color: '#fff' }}>?</Text>
              </View>
            )}
            <View>
              <Text style={styles.headerTitleText}>{headerUser.userName}</Text>
              <Text style={styles.headerSubText}>{presenceLabel}</Text>
            </View>
          </TouchableOpacity>
        ),
        headerRight: renderHeaderRight
      });
      return;
    }

    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          {groupHeader.groupAvatar && <Image source={{ uri: groupHeader.groupAvatar }} style={styles.headerAvatar} />}
          <View>
            <Text style={styles.headerTitleText}>{groupHeader.name}</Text>
            <Text style={styles.headerSubText}>{groupHeader.memberCount} учасників</Text>
          </View>
        </View>
      ),
      headerRight: renderHeaderRight
    });
  }, [
    chatType,
    groupHeader.groupAvatar,
    groupHeader.memberCount,
    groupHeader.name,
    handleOpenUserInfo,
    headerUser,
    headerUserId,
    locale,
    navigation,
    renderHeaderRight
  ]);

  useEffect(() => {
    if (!guildId) return;
    const ref = database().ref(`guilds/${guildId}/guildUsers`);
    const listener = ref.on('value', (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data)
        .map(([id, user]) => ({
          id,
          userName: user?.userName || '',
          imageUrl: user?.imageUrl || ''
        }))
        .filter((user) => user.userName);
      setGuildMembers(list);
    });
    return () => ref.off('value', listener);
  }, [guildId]);

  useEffect(() => {
    if (!newMessagePlain) {
      setMentionStartIndex(null);
      setMentionSuggestions([]);
      return;
    }

    const caret = Number.isFinite(composerCaretIndex) ? composerCaretIndex : 0;
    const textBeforeCaret = newMessagePlain.slice(0, caret);
    const atIndex = textBeforeCaret.lastIndexOf('@');
    if (atIndex === -1) {
      setMentionStartIndex(null);
      setMentionSuggestions([]);
      return;
    }

    const charBefore = atIndex > 0 ? textBeforeCaret[atIndex - 1] : '';
    if (charBefore && !/\s/.test(charBefore)) {
      setMentionStartIndex(null);
      setMentionSuggestions([]);
      return;
    }

    const query = textBeforeCaret.slice(atIndex + 1);
    if (/\s/.test(query)) {
      setMentionStartIndex(null);
      setMentionSuggestions([]);
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const filtered = guildMembers.filter((member) =>
      member.userName.toLowerCase().startsWith(normalizedQuery)
    );

    setMentionStartIndex(atIndex);
    setMentionSuggestions(filtered);
  }, [newMessagePlain, composerCaretIndex, guildMembers]);

  useEffect(() => {
    if (!chatId || !guildId) return;

    const msgRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
    const listener = msgRef.on('value', (snap) => {
      const raw = snap.val() || {};
      const list = Object.entries(raw).map(([id, msg]) => ({ id, ...msg }));

      const grouped = list.reduce((acc, msg) => {
        const dateKey = safeFormat(msg.timestamp, 'd MMMM', locale) || '—';
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(msg);
        return acc;
      }, {});

      const sortedGroups = Object.keys(grouped)
        .map((date) => ({
          date,
          messages: grouped[date].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
        }))
        .sort((a, b) => Number(a.messages?.[0]?.timestamp || 0) - Number(b.messages?.[0]?.timestamp || 0));

      setGroups(sortedGroups);
    });

    return () => msgRef.off('value', listener);
  }, [chatId, guildId, locale]);

  // ✅ pinned тільки якщо pinnedFor[userId] === true
  const pinnedMessages = useMemo(() => {
    const all = groups.flatMap((g) => g.messages);
    const pinned = all.filter((m) => !!m?.pinned?.pinnedFor?.[userId]);
    // ✅ сорт: найсвіжіші -> найстаріші
    return pinned.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }, [groups, userId]);

  // --- FLAT DATA: щоб можна було точно scrollToMessage(id) ---
  const flatData = useMemo(() => {
    const data = [];
    const groupsDesc = [...groups].reverse(); // newest date first

    groupsDesc.forEach((g) => {
      const msgsDesc = [...g.messages].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)); // newest first
      msgsDesc.forEach((m) => {
        data.push({
          type: 'msg',
          id: m.id,
          msg: m,
          dateLabel: g.date
        });
      });

      // date header після messages (бо list inverted)
      data.push({
        type: 'date',
        id: `date_${g.date}_${g.messages?.[0]?.timestamp || Date.now()}`,
        dateLabel: g.date
      });
    });

    return data;
  }, [groups]);

  const messageIndexMap = useMemo(() => {
    const map = {};
    flatData.forEach((item, idx) => {
      if (item.type === 'msg' && item.id) map[item.id] = idx;
    });
    return map;
  }, [flatData]);

  const highlightMessage = useCallback((messageId) => {
    if (!messageId) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);

    setHighlightedMessageId(messageId);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1600);
  }, []);

  const scrollToMessage = useCallback(
    (messageId) => {
      const index = messageIndexMap[messageId];
      if (index === undefined || index === null) return;

      try {
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5
        });
        highlightMessage(messageId);
      } catch (e) {}
    },
    [messageIndexMap, highlightMessage]
  );

  const onScrollToIndexFailed = useCallback((info) => {
    try {
      flatListRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: true
      });

      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.5
          });
        } catch (e) {}
      }, 250);
    } catch (e) {}
  }, []);

  // ✅ CRASH-FIX: правильний Set.has(...)
  const markAsRead = useCallback(
    (msgs) => {
      if (!userId || !guildId || !chatId) return;

      msgs.forEach((msg) => {
        if (!msg?.id) return;
        if (msg.senderId === userId) return;

        // ✅ було: processedRead.current.has.has(msg.id)  -> це валило додаток
        if (processedRead.current.has(msg.id)) return;

        if (!msg.readBy || !msg.readBy[userId]) {
          database().ref(`guilds/${guildId}/chats/${chatId}/messages/${msg.id}/readBy/${userId}`).set(Date.now());
        }

        processedRead.current.add(msg.id);
      });
    },
    [userId, guildId, chatId]
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      const visibleMsgs = viewableItems
        .map((v) => v.item)
        .filter((it) => it && it.type === 'msg')
        .map((it) => it.msg);
      markAsRead(visibleMsgs);
    },
    [markAsRead]
  );

  const formatReadTime = (timestamp) => {
    if (!timestamp) return '';
    const date = safeDate(timestamp);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const timeString = safeFormat(timestamp, 'HH:mm', locale);

    if (date.toDateString() === now.toDateString()) return `сьогодні, ${timeString}`;
    if (date.toDateString() === yesterday.toDateString()) return `учора, ${timeString}`;
    return `${safeFormat(timestamp, 'dd MMM', locale)}, ${timeString}`;
  };

  const renderReadReceiptOption = (message) => {
    if (!message || chatType !== 'private') return null;
    const { readBy, senderId } = message;
    if (!readBy) return null;
    const otherEntries = Object.entries(readBy).filter(([id]) => id !== senderId);
    if (otherEntries.length === 0) return null;
    const readTime = otherEntries[0][1];
    return (
      <>
        <View style={styles.readReceiptOption}>
          <FontAwesomeIcon icon={faCheckDouble} size={16} color="#4CAF50" style={{ marginRight: 5 }} />
          <Text style={{ color: '#eee' }}>{formatReadTime(readTime)}</Text>
        </View>
        <View style={styles.menuSeparator} />
      </>
    );
  };

  const renderGroupReadReceiptOption = (message) => {
    if (!message || chatType !== 'group') return null;
    const { readBy, senderId } = message;
    if (!readBy) return null;
    const entries = Object.entries(readBy)
      .filter(([id]) => id !== senderId)
      .sort((a, b) => a[1] - b[1]);
    if (entries.length === 0) return null;
    const [firstId] = entries[0];
    const extra = entries.length - 1;
    return (
      <>
        <TouchableOpacity disabled={extra <= 0} onPress={() => extra > 0 && setReadUsersPopupFor(message.id)}>
          <View style={styles.readReceiptOption}>
            <FontAwesomeIcon icon={faCheckDouble} size={16} color="#4CAF50" style={{ marginRight: 5 }} />
            <ReadUserInline userId={firstId} guildId={guildId} />
            {extra > 0 && <Text style={styles.extraCount}> (+{extra})</Text>}
          </View>
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
      </>
    );
  };

  const handleFormatText = (marker) => {
    const { start, end } = selection;
    const text = editMessage ? editMessageText : newMessage;
    if (start === end) return;
    const newText = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
    if (editMessage) setEditMessageText(newText);
    else setNewMessage(newText);
  };

  const handleReply = (msg) => setReplyToMessage(msg);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true
    });
    if (!result.canceled) {
      setSelectedImageUris(result.assets.map((a) => a.uri));
      setCaptionModalVisible(true);
    }
  };

  const uploadImages = async () => {
    if (!selectedImageUris.length) return;
    const ref = database().ref(`guilds/${guildId}/chats/${chatId}/messages`).push();
    const urls = [];
    for (const uri of selectedImageUris) {
      const imgRef = storage().ref(`images/${uuid.v4()}.jpg`);
      await imgRef.putFile(uri);
      urls.push(await imgRef.getDownloadURL());
    }
    await ref.set({
      senderId: userId,
      text: imageCaption,
      imageUrls: urls,
      timestamp: Date.now(),
      status: 'sent'
    });
    setSelectedImageUris([]);
    setImageCaption('');
    setCaptionModalVisible(false);
  };

  const handleStartRecording = async () => {
    if (isRecording || isUploadingAudio) return;
    if (!guildId || !chatId || !userId) {
      Alert.alert('Помилка', 'Не вдалося визначити чат для запису.');
      return;
    }
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Доступ до мікрофона', 'Потрібен доступ до мікрофона для запису голосових повідомлень.');
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false
    });
    recordingMeteringsRef.current = [];
    const recordingOptions = {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true
    };
    const { recording } = await Audio.Recording.createAsync(
      recordingOptions,
      (status) => {
        if (status.isRecording && Number.isFinite(status.metering)) {
          recordingMeteringsRef.current.push(status.metering);
        }
      },
      100
    );
    recordingRef.current = recording;
    setIsRecording(true);
    setRecordingDuration(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1000);
    }, 1000);
  };

  const handleStopRecording = async () => {
    if (!isRecording || !recordingRef.current || !guildId || !chatId || !userId) return;
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const recording = recordingRef.current;
    recordingRef.current = null;
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true
    });
    const uri = recording.getURI();
    if (!uri) return;
    const status = await recording.getStatusAsync();
    const durationMillis = status?.durationMillis || recordingDuration;
    const waveform = buildWaveform(recordingMeteringsRef.current);
    const extension = uri.split('.').pop() || 'm4a';
    setIsUploadingAudio(true);
    try {
      const audioRef = storage().ref(`voiceMessages/${chatId}/${uuid.v4()}.${extension}`);
      await audioRef.putFile(uri);
      const audioUrl = await audioRef.getDownloadURL();
      const ref = database().ref(`guilds/${guildId}/chats/${chatId}/messages`).push();
      await ref.set({
        senderId: userId,
        audioUrl,
        audioDuration: durationMillis,
        audioWaveform: waveform,
        timestamp: Date.now(),
        status: 'sent',
        replyTo: replyToMessage?.id || null
      });
      setReplyToMessage(null);
    } catch (error) {
      Alert.alert('Помилка', 'Не вдалося надіслати голосове повідомлення.');
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleToggleAudioPlayback = async (message) => {
    if (!message?.audioUrl) return;
    if (playingAudioId === message.id) {
      await audioPlaybackRef.current?.pauseAsync();
      setPlayingAudioId(null);
      setAudioPlaybackState((prev) => ({ ...prev, id: null }));
      return;
    }
    await stopPlayback();
    const { sound } = await Audio.Sound.createAsync({ uri: message.audioUrl }, { shouldPlay: true });
    audioPlaybackRef.current = sound;
    setPlayingAudioId(message.id);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      setAudioPlaybackState({
        id: message.id,
        position: status.positionMillis || 0,
        duration: status.durationMillis || message.audioDuration || 0
      });
      if (status.didJustFinish) {
        stopPlayback().catch(() => {});
      }
    });
  };

  const handleScheduleSend = (date) => {
    setIsDatePickerVisible(false);
    if (!newMessage.trim()) {
      Alert.alert('Помилка', 'Спочатку введіть текст повідомлення.');
      return;
    }
    const scheduledKyivTime = moment.tz(date, 'Europe/Kiev');
    const nowInKyiv = moment.tz('Europe/Kiev');
    if (scheduledKyivTime.isBefore(nowInKyiv)) {
      Alert.alert('Невірний час', 'Не можна запланувати відправку на час, що вже минув.');
      return;
    }
    const utcTimestamp = scheduledKyivTime.valueOf();
    const scheduledMessageData = {
      text: newMessage,
      html: newMessageHtml || null,
      senderId: userId,
      guildId,
      chatId,
      sendAt: utcTimestamp,
      status: 'pending',
      replyTo: replyToMessage?.id || null
    };
    database()
      .ref(`guilds/${guildId}/scheduledMessages`)
      .push(scheduledMessageData)
      .then(() => {
        setNewMessage('');
        setNewMessagePlain('');
        setNewMessageHtml('');
        setReplyToMessage(null);
        setComposerSelectionActive(false);
        composerRef.current?.clear?.();
        Alert.alert('Заплановано', `Ваше повідомлення буде відправлено ${scheduledKyivTime.format('DD.MM.YYYY о HH:mm')}`);
      })
      .catch((error) => {
        Alert.alert('Помилка планування', error.message);
      });
  };

  const handleSend = async () => {
    if (!newMessage.trim() && !editMessage) return;

    if (editMessage) {
      await database().ref(`guilds/${guildId}/chats/${chatId}/messages/${editMessage.id}`).update({
        text: editMessageText,
        edited: true
      });
      setEditMessage(null);
      setEditMessageText('');
      return;
    }

    const ref = database().ref(`guilds/${guildId}/chats/${chatId}/messages`).push();
    await ref.set({
      senderId: userId,
      text: newMessage,
      html: newMessageHtml || null,
      timestamp: Date.now(),
      status: 'sent',
      replyTo: replyToMessage?.id || null
    });

    setNewMessage('');
    setNewMessagePlain('');
    setNewMessageHtml('');
    setReplyToMessage(null);
    setComposerSelectionActive(false);
    composerRef.current?.clear?.();
  };

  const handleSelectMention = (member) => {
    if (mentionStartIndex === null || !member?.userName) return;
    const mentionText = `@${member.userName} `;
    composerRef.current?.replaceRange?.(mentionStartIndex, composerCaretIndex, mentionText);
    setMentionStartIndex(null);
    setMentionSuggestions([]);
  };

  const resolveSelectedMessage = (fallback) => {
    if (fallback) return fallback;
    if (!selectedMessageId) return null;
    const all = groups.flatMap((g) => g.messages);
    return all.find((m) => m.id === selectedMessageId) || null;
  };

  const handlePin = async (forAll, targetMessage = null) => {
    const msg = resolveSelectedMessage(targetMessage);
    if (!msg) return;

    const pinnedRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${msg.id}/pinned`);

    if (forAll) {
      const membersSnap = await database().ref(`guilds/${guildId}/chats/${chatId}/members`).once('value');
      const members = membersSnap.val() || {};
      const pinnedFor = {};
      Object.keys(members).forEach((id) => (pinnedFor[id] = true));
      // ✅ forAll: true
      await pinnedRef.set({ forAll: true, pinnedFor });
    } else {
      // ✅ тільки для мене (НЕ ставимо глобальний isPinned)
      await pinnedRef.update({ forAll: false, [`pinnedFor/${userId}`]: true });
    }

    setPinModalVisible(false);
    setMessageToPin(null);
    setSelectedMessageId(null);
  };

  const handleUnpin = async (forAll, targetMessage = null) => {
    const msg = resolveSelectedMessage(targetMessage);
    if (!msg) return;

    const pinnedRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${msg.id}/pinned`);

    if (forAll) {
      await pinnedRef.remove();
    } else {
      await pinnedRef.child(`pinnedFor/${userId}`).remove();

      // ✅ якщо це було "forAll", після видалення для себе — вже НЕ forAll
      const snap = await pinnedRef.once('value');
      const val = snap.val() || {};
      const pinnedFor = val.pinnedFor || {};
      const keys = Object.keys(pinnedFor);

      if (val.forAll) {
        await pinnedRef.child('forAll').set(false);
      }

      // ✅ якщо більше ні для кого не закріплено — прибираємо вузол повністю
      if (keys.length === 0) {
        await pinnedRef.remove();
      }
    }

    setUnpinModalVisible(false);
    setMessageToPin(null);
    setSelectedMessageId(null);
  };

  const handleTranslate = async (message) => {
    if (!message?.id || !guildId || !chatId) return;
    const sourceText = (message.text || '').trim() || stripHtml(message.html);
    if (!sourceText) {
      Alert.alert('Помилка', 'Немає тексту для перекладу.');
      return;
    }
    try {
      const translationRef = database().ref(
        `guilds/${guildId}/chats/${chatId}/messages/${message.id}/translate/${localeCode}`
      );
      const snap = await translationRef.once('value');
      let translated = snap.val();
      if (!translated || !String(translated).trim()) {
        translated = await translateMessage(sourceText, localeCode);
        await translationRef.set(translated);
      }
      setTranslatedText(translated);
      setTranslationModalVisible(true);
    } catch (error) {
      const apiMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Невідома помилка';
      console.error('Помилка перекладу:', apiMessage, error?.response?.data || error);
      Alert.alert('Помилка', `Не вдалося перекласти повідомлення. Причина: ${apiMessage}`);
    }
  };

  // avatar-logic: "попереднє" повідомлення в ВІЗУАЛЬНОМУ порядку.
  const getPrevVisualMsgSameDate = useCallback(
    (index, dateLabel) => {
      for (let i = index + 1; i < flatData.length; i++) {
        const it = flatData[i];
        if (!it) continue;
        if (it.type === 'date') return null;
        if (it.type === 'msg' && it.dateLabel === dateLabel) return it.msg;
      }
      return null;
    },
    [flatData]
  );

  const keyboardOffset = insets.bottom;

  return (
    <MenuProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['right', 'left']}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={keyboardOffset}
        >
          <View style={{ flex: 1 }}>
            {/* ✅ Закріплені: свайп -> скрол чату до видимого pinned + підсвітка */}
            {pinnedMessages.length > 0 && (
              <View style={styles.pinnedContainer}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(windowWidth, 1));
                    const msg = pinnedMessages[page];
                    if (msg?.id) scrollToMessage(msg.id);
                  }}
                >
                  {pinnedMessages.map((msg) => (
                    <TouchableOpacity
                      key={msg.id}
                      style={[styles.pinnedItemPage, { width: windowWidth }]}
                      activeOpacity={0.9}
                      onPress={() => msg?.id && scrollToMessage(msg.id)}
                    >
                      <View style={styles.pinnedItemInner}>
                        <View style={styles.pinnedBar} />

                        {/* ✅ "Закріплено" і текст — різні рядки */}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pinnedLabel}>Закріплено</Text>

                          {/* ✅ превʼю без "Посилання", без "youtu.be" як fallback (беремо title), з thumbnail для фото */}
                          <CompactMessagePreview message={msg} lines={1} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Плоский список (msg/date) */}
            <FlatList
              ref={flatListRef}
              data={flatData}
              inverted={true}
              keyExtractor={(item) => (item.type === 'msg' ? `m_${item.id}` : item.id)}
              keyboardShouldPersistTaps="handled"
              onScrollToIndexFailed={onScrollToIndexFailed}
              onViewableItemsChanged={handleViewableItemsChanged}
              contentContainerStyle={{ paddingVertical: 10 }}
              renderItem={({ item, index }) => {
                if (item.type === 'date') {
                  return (
                    <View style={styles.dateBadgeContainer}>
                      <Text style={styles.dateBadge}>{item.dateLabel}</Text>
                    </View>
                  );
                }

                const msg = item.msg;
                if (!msg || msg.deletedFor?.[userId]) return null;

                const isMe = msg.senderId === userId;

                const prevMsg = getPrevVisualMsgSameDate(index, item.dateLabel);
                const showAvatar = chatType === 'group' && !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);

                const messageText = msg.text || '';
                const urlsInText = extractUrlsFromText(messageText);
                const urlsInHtml = extractUrlsFromHtml(msg.html || '');
                const allUrls = [...urlsInText, ...urlsInHtml].filter(Boolean);
                const uniqueUrls = Array.from(new Set(allUrls));

                const isHighlighted = highlightedMessageId === msg.id;

                const isPinnedForMe = !!msg?.pinned?.pinnedFor?.[userId];
                const isPinnedForAll = !!msg?.pinned?.forAll;

                return (
                  <View style={[styles.messageRow, isMe ? styles.rowRight : styles.rowLeft]}>
                    {!isMe && showAvatar && (
                      <TouchableOpacity activeOpacity={0.7} onPress={() => handleOpenUserInfo(msg.senderId)}>
                        <InterlocutorAvatar senderId={msg.senderId} guildId={guildId} />
                      </TouchableOpacity>
                    )}
                    {!isMe && !showAvatar && chatType === 'group' && <View style={{ width: 40 }} />}

                    <Menu>
                      <MenuTrigger
                        triggerOnLongPress
                        onPress={() => setSelectedMessageId(msg.id)}
                        customStyles={{
                          TriggerTouchableComponent: TouchableOpacity,
                          triggerOuterWrapper: isMe ? styles.menuTriggerRight : styles.menuTriggerLeft
                        }}
                      >
                        <View
                          style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                            msg.replyTo ? styles.bubbleReply : null,
                            isHighlighted ? styles.bubbleHighlighted : null
                          ]}
                        >
                          {chatType === 'group' && !isMe && (
                            <SenderName senderId={msg.senderId} currentUserId={userId} guildId={guildId} />
                          )}

                          {/* ТАП по цитаті -> scroll + highlight */}
                          {msg.replyTo && (
                            <QuotedMessage
                              replyTo={msg.replyTo}
                              guildId={guildId}
                              chatId={chatId}
                              minimal
                              onPress={scrollToMessage}
                            />
                          )}

                          {msg.imageUrls?.length > 0 && (
                            <View style={styles.imageGrid}>
                              {msg.imageUrls.map((uri, i) => (
                                <TouchableOpacity
                                  key={i}
                                  onPress={() => {
                                    setFullSizeImageUri(uri);
                                    setFullSizeImageModalVisible(true);
                                  }}
                                >
                                  <Image source={{ uri }} style={styles.gridImage} />
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}

                          {!!msg.audioUrl && (
                            <TouchableOpacity
                              style={styles.audioContainer}
                              onPress={() => handleToggleAudioPlayback(msg)}
                              activeOpacity={0.8}
                            >
                              <View style={styles.audioRow}>
                                <View style={styles.audioPlayButton}>
                                  <FontAwesomeIcon
                                    icon={playingAudioId === msg.id ? faPause : faPlay}
                                    size={14}
                                    color="#fff"
                                  />
                                </View>
                                <View style={styles.audioWaveformBlock}>
                                  <View style={styles.audioWaveformGrid}>
                                    {WAVEFORM_GRID_LINES.map((position) => (
                                      <View
                                        key={`${msg.id}-grid-${position}`}
                                        style={[styles.audioWaveformGridLine, { top: `${position * 100}%` }]}
                                      />
                                    ))}
                                  </View>
                                  <View style={styles.audioWaveform}>
                                    {(() => {
                                      const bars = getWaveformBars(msg.audioWaveform);
                                      const progress =
                                        audioPlaybackState.id === msg.id && audioPlaybackState.duration
                                          ? audioPlaybackState.position / audioPlaybackState.duration
                                          : 0;
                                      const playedBars = Math.round(progress * bars.length);
                                      return bars.map((value, index) => (
                                        <View
                                          key={`${msg.id}-bar-${index}`}
                                          style={[
                                            styles.audioWaveBar,
                                            index < playedBars && styles.audioWaveBarPlayed,
                                            {
                                              height:
                                                WAVEFORM_MIN_HEIGHT +
                                                value * (WAVEFORM_MAX_HEIGHT - WAVEFORM_MIN_HEIGHT)
                                            }
                                          ]}
                                        />
                                      ));
                                    })()}
                                  </View>
                                  <Text style={styles.audioDuration}>{formatDuration(msg.audioDuration)}</Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          )}

                          {!!messageText && <FormattedText text={messageText} />}

                          {uniqueUrls.map((u) => (
                            <LinkPreviewCard key={`h_${msg.id}_${u}`} url={u} />
                          ))}

                          <View style={styles.metaContainer}>
                            {/* ✅ показуємо "пін" лише якщо pinned для МЕНЕ */}
                            {isPinnedForMe && (
                              <FontAwesomeIcon icon={faThumbtack} size={10} color="#888" style={{ marginRight: 4 }} />
                            )}
                            {msg.edited && <Text style={styles.editedLabel}>ред.</Text>}
                            <Text style={styles.timestamp}>{safeFormat(msg.timestamp, 'HH:mm')}</Text>
                            {isMe && (
                              <FontAwesomeIcon
                                icon={
                                  msg.readBy && Object.keys(msg.readBy).some((id) => id !== userId)
                                    ? faCheckDouble
                                    : faCheck
                                }
                                size={11}
                                color="#4cd137"
                                style={{ marginLeft: 4 }}
                              />
                            )}
                          </View>
                        </View>
                      </MenuTrigger>

                      <MenuOptions customStyles={{ optionsContainer: styles.contextMenu }}>
                        {renderGroupReadReceiptOption(msg)}
                        {renderReadReceiptOption(msg)}

                        <MenuOption onSelect={() => handleReply(msg)} style={styles.menuItem}>
                          <FontAwesomeIcon icon={faReply} color="#ddd" />
                          <Text style={styles.menuText}>Відповісти</Text>
                        </MenuOption>

                        <MenuOption onSelect={() => Clipboard.setString(msg.text || '')} style={styles.menuItem}>
                          <FontAwesomeIcon icon={faCopy} color="#ddd" />
                          <Text style={styles.menuText}>Копіювати</Text>
                        </MenuOption>

                        {isMe && (
                          <>
                            <MenuOption
                              onSelect={() => {
                                setEditMessage(msg);
                                setEditMessageText(msg.text || '');
                                composerRef.current?.clear?.();
                                setNewMessage('');
                                setNewMessageHtml('');
                              }}
                              style={styles.menuItem}
                            >
                              <FontAwesomeIcon icon={faPen} color="#ddd" />
                              <Text style={styles.menuText}>Редагувати</Text>
                            </MenuOption>

                            <MenuOption
                              onSelect={() => {
                                setMessageToDelete(msg);
                                setSelectedMessageId(msg.id);
                                setDeleteModalVisible(true);
                              }}
                              style={styles.menuItem}
                            >
                              <FontAwesomeIcon icon={faTrash} color="#ff5b5b" />
                              <Text style={[styles.menuText, { color: '#ff5b5b' }]}>Видалити</Text>
                            </MenuOption>
                          </>
                        )}

                        <MenuOption
                          onSelect={() => {
                            setSelectedMessageId(msg.id);
                            setMessageToPin(msg);

                            // ✅ якщо вже pinned для мене:
                            // - якщо forAll => питаємо (для себе / для всіх)
                            // - якщо тільки для мене => відкріпляємо без перепитування
                            if (isPinnedForMe) {
                              if (isPinnedForAll) {
                                setUnpinModalVisible(true);
                              } else {
                                handleUnpin(false, msg);
                              }
                            } else {
                              setPinModalVisible(true);
                            }
                          }}
                          style={styles.menuItem}
                        >
                          <FontAwesomeIcon icon={faThumbtack} color="#ddd" />
                          <Text style={styles.menuText}>{isPinnedForMe ? 'Відкріпити' : 'Закріпити'}</Text>
                        </MenuOption>

                        <MenuOption onSelect={() => handleTranslate(msg)} style={styles.menuItem}>
                          <TransleteIcon width={16} height={16} fill="#ddd" />
                          <Text style={styles.menuText}>Перекласти</Text>
                        </MenuOption>
                      </MenuOptions>

                      {readUsersPopupFor === msg.id && (
                        <ReadUsersPopup
                          message={msg}
                          guildId={guildId}
                          isCurrentUser={isMe}
                          onClose={() => setReadUsersPopupFor(null)}
                        />
                      )}
                    </Menu>
                  </View>
                );
              }}
            />

            {/* Панель відповіді */}
            {replyToMessage && (
              <View style={styles.replyBar}>
                <View style={styles.replyBarLine} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyBarTitle}>Відповідь:</Text>
                  <Text style={styles.replyBarText} numberOfLines={1}>
                    {stripUrls(replyToMessage.text || '') || 'Медіа'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyToMessage(null)}>
                  <FontAwesomeIcon icon={faXmark} color="#aaa" />
                </TouchableOpacity>
              </View>
            )}

            {/* Ввід */}
            <View style={styles.inputArea}>
              {isRecording && (
                <View style={styles.recordingBar}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Запис… {formatDuration(recordingDuration)}</Text>
                </View>
              )}
              {editMessage && selection.start !== selection.end && (
                <View style={styles.formatTools}>
                  <TouchableOpacity onPress={() => handleFormatText('**')}>
                    <FontAwesomeIcon icon={faBold} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleFormatText('_')}>
                    <FontAwesomeIcon icon={faItalic} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleFormatText('~~')}>
                    <FontAwesomeIcon icon={faStrikethrough} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleFormatText('__')}>
                    <FontAwesomeIcon icon={faUnderline} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleFormatText('||')}>
                    <FontAwesomeIcon icon={faEyeSlash} color="#fff" size={16} />
                  </TouchableOpacity>
                </View>
              )}

              {!editMessage && composerSelectionActive && (
                <View style={styles.formatTools}>
                  <TouchableOpacity onPress={() => composerRef.current?.cmd?.('bold')}>
                    <FontAwesomeIcon icon={faBold} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => composerRef.current?.cmd?.('italic')}>
                    <FontAwesomeIcon icon={faItalic} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => composerRef.current?.cmd?.('strikeThrough')}>
                    <FontAwesomeIcon icon={faStrikethrough} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => composerRef.current?.cmd?.('underline')}>
                    <FontAwesomeIcon icon={faUnderline} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => composerRef.current?.spoiler?.()}>
                    <FontAwesomeIcon icon={faEyeSlash} color="#fff" size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsLinkModalVisible(true)}>
                    <FontAwesomeIcon icon={faLink} color="#fff" size={16} />
                  </TouchableOpacity>
                </View>
              )}

              {!editMessage && mentionStartIndex !== null && mentionSuggestions.length > 0 && (
                <View style={styles.mentionList}>
                  <ScrollView>
                    {mentionSuggestions.map((member) => (
                      <TouchableOpacity
                        key={member.id}
                        style={styles.mentionItem}
                        onPress={() => handleSelectMention(member)}
                      >
                        {member.imageUrl ? (
                          <Image source={{ uri: member.imageUrl }} style={styles.mentionAvatar} />
                        ) : (
                          <View style={[styles.mentionAvatar, styles.mentionAvatarFallback]}>
                            <Text style={{ color: '#fff' }}>{member.userName[0]?.toUpperCase() || '?'}</Text>
                          </View>
                        )}
                        <Text style={styles.mentionName}>@{member.userName}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.inputContainer}>
                <TouchableOpacity style={styles.attachBtn} onPress={pickImage}>
                  <FontAwesomeIcon icon={faPaperclip} size={22} color="#888" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.micBtn, isRecording && styles.micBtnActive]}
                  onPress={isRecording ? handleStopRecording : handleStartRecording}
                  disabled={isUploadingAudio}
                >
                  <FontAwesomeIcon icon={isRecording ? faStop : faMicrophone} size={18} color="#fff" />
                </TouchableOpacity>

                {editMessage ? (
                  <TextInput
                    style={[
                      styles.input,
                      { height: Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, inputHeight)) }
                    ]}
                    value={editMessageText}
                    onChangeText={setEditMessageText}
                    onSelectionChange={({ nativeEvent: { selection } }) => setSelection(selection)}
                    onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
                    placeholder="Повідомлення..."
                    placeholderTextColor="#666"
                    multiline
                    textAlignVertical="top"
                  />
                ) : (
                  <View style={{ flex: 1 }}>
                    <RichTextWebInput
                      ref={composerRef}
                      placeholder="Повідомлення..."
                      minHeight={MIN_INPUT_HEIGHT}
                      maxHeight={MAX_INPUT_HEIGHT}
                      onChange={({ html, marked, selectionActive, caretIndex, text }) => {
                        setNewMessage(marked);
                        setNewMessageHtml(html);
                        setNewMessagePlain(text || '');
                        setComposerSelectionActive(!!selectionActive);
                        setComposerCaretIndex(Number.isFinite(caretIndex) ? caretIndex : 0);
                      }}
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.sendBtn, (newMessage.trim() || editMessage) && styles.sendBtnActive]}
                  onPress={handleSend}
                  onLongPress={() => setSendOptionsPopupVisible(true)}
                  disabled={isRecording || isUploadingAudio}
                >
                  <FontAwesomeIcon icon={editMessage ? faCheck : faPaperPlane} size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              <SendOptionsPopup
                visible={sendOptionsPopupVisible}
                chatType={chatType}
                onClose={() => setSendOptionsPopupVisible(false)}
                onSendLater={() => setIsDatePickerVisible(true)}
                onSendToSelected={() => Alert.alert('Функція', 'Надіслати обраним')}
              />
            </View>

            <View style={{ height: insets.bottom, backgroundColor: '#1c1c1e' }} />
          </View>
        </KeyboardAvoidingView>

        <UserInfoPopup
          visible={userInfoPopupVisible}
          user={userInfoPopupUser}
          loading={userInfoPopupLoading}
          onClose={() => setUserInfoPopupVisible(false)}
        />

        {/* --- Модалки --- */}
        <Modal visible={captionModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Додати підпис</Text>
              <ScrollView horizontal style={{ marginBottom: 15 }}>
                {selectedImageUris.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.uploadThumb} />
                ))}
              </ScrollView>
              <TextInput
                style={styles.modalInput}
                placeholder="Підпис..."
                value={imageCaption}
                onChangeText={setImageCaption}
                placeholderTextColor="#888"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setCaptionModalVisible(false)}>
                  <Text style={{ color: '#fff' }}>Скасувати</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={uploadImages}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Надіслати</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={isLinkModalVisible} transparent animationType="fade" onRequestClose={() => setIsLinkModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Вставити лінк</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="https://example.com"
                placeholderTextColor="#888"
                value={linkUrl}
                onChangeText={setLinkUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => {
                    setIsLinkModalVisible(false);
                    setLinkUrl('');
                  }}
                >
                  <Text style={{ color: '#fff' }}>Скасувати</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalBtnPrimary}
                  onPress={() => {
                    const url = normalizeUrl(linkUrl);
                    setIsLinkModalVisible(false);
                    setLinkUrl('');
                    if (url) composerRef.current?.link?.(url);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Застосувати</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={deleteModalVisible} transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Видалити повідомлення?</Text>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  database().ref(`guilds/${guildId}/chats/${chatId}/messages/${messageToDelete.id}`).remove();
                  setDeleteModalVisible(false);
                }}
              >
                <Text style={{ color: '#ff5b5b' }}>Видалити для всіх</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  database().ref(`guilds/${guildId}/chats/${chatId}/messages/${messageToDelete.id}/deletedFor/${userId}`).set(true);
                  setDeleteModalVisible(false);
                }}
              >
                <Text style={{ color: '#fff' }}>Видалити для себе</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteModalVisible(false)}>
                <Text style={{ color: '#aaa' }}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={pinModalVisible} transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Закріпити повідомлення</Text>

              <TouchableOpacity style={styles.actionBtn} onPress={() => handlePin(false, messageToPin)}>
                <Text style={{ color: '#fff' }}>Тільки для мене</Text>
              </TouchableOpacity>

              {/* ✅ тепер "Для всіх" доступно і в private, і в group */}
              <TouchableOpacity style={styles.actionBtn} onPress={() => handlePin(true, messageToPin)}>
                <Text style={{ color: '#fff' }}>Для всіх</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => setPinModalVisible(false)}>
                <Text style={{ color: '#aaa' }}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={unpinModalVisible} transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Відкріпити?</Text>

              <TouchableOpacity style={styles.actionBtn} onPress={() => handleUnpin(false, messageToPin)}>
                <Text style={{ color: '#fff' }}>Тільки в мене</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => handleUnpin(true, messageToPin)}>
                <Text style={{ color: '#ff5b5b' }}>Для всіх</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => setUnpinModalVisible(false)}>
                <Text style={{ color: '#aaa' }}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <ImageViewerModal visible={fullSizeImageModalVisible} uri={fullSizeImageUri} onClose={() => setFullSizeImageModalVisible(false)} />

        <Modal
          animationType="slide"
          transparent
          visible={translationModalVisible}
          onRequestClose={() => setTranslationModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Переклад</Text>
              <ScrollView style={{ maxHeight: 240 }}>
                <Text style={styles.translatedText}>{translatedText}</Text>
              </ScrollView>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setTranslationModalVisible(false)}>
                <Text style={{ color: '#fff' }}>Закрити</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <DatePicker
          modal
          open={isDatePickerVisible}
          date={new Date()}
          mode="datetime"
          onConfirm={handleScheduleSend}
          onCancel={() => setIsDatePickerVisible(false)}
          title="Запланувати відправку"
          confirmText="Підтвердити"
          cancelText="Скасувати"
          minimumDate={new Date()}
          theme="dark"
        />
      </SafeAreaView>
    </MenuProvider>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  // pinned
  pinnedContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#333',
    overflow: 'hidden'
  },
  pinnedItemPage: { paddingHorizontal: 10 },

  // ✅ робимо контейнер рядком: бар + контент-колонка
  pinnedItemInner: { flexDirection: 'row', alignItems: 'center', width: '100%' },

  // зафіксовано як ти просив:
  pinnedBar: { width: 4, height: 30, backgroundColor: '#3498db', borderRadius: 2, marginRight: 10 },
  pinnedLabel: { color: '#3498db', fontSize: 11, fontWeight: 'bold' },

  dateBadgeContainer: { alignItems: 'center', marginVertical: 15 },
  dateBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    color: '#aaa',
    fontSize: 12
  },

  messageRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 4 },
  menuTriggerRight: { width: '100%', alignItems: 'flex-end' },
  menuTriggerLeft: { width: '100%', alignItems: 'flex-start' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, marginBottom: 2 },
  bubbleReply: { minWidth: '36%' },
  bubbleMe: {
    maxWidth: '78%',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(52, 152, 219, 0.25)',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.3)'
  },
  bubbleThem: {
    maxWidth: '88%',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },

  // підсвітка знайденого/цільового повідомлення
  bubbleHighlighted: {
    borderColor: '#3498db',
    borderWidth: 2
  },

  senderName: { color: '#3498db', fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
  messageText: { color: '#fff', fontSize: 16, lineHeight: 22 },

  metaContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timestamp: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginRight: 4 },
  editedLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontStyle: 'italic', marginRight: 4 },

  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  gridImage: { width: 80, height: 80, borderRadius: 8, marginRight: 4, marginBottom: 4 },

  linkPreviewContainer: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  linkPreviewImage: { width: '100%', height: 120 },
  linkPreviewTextContainer: { padding: 10 },
  linkPreviewTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  linkPreviewDescription: { color: '#aaa', fontSize: 12, marginTop: 2 },

  // ✅ монохромний бейдж
  mediaIconBadgeMono: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 8
  },

  quotedContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 6 },
  quotedMinimal: { padding: 4 },
  quotedLine: { width: 3, backgroundColor: '#3498db', borderRadius: 2, marginRight: 8 },
  quotedContent: { flex: 1 },
  quotedTitle: { color: '#3498db', fontSize: 11, fontWeight: '700', marginBottom: 4 },

  interlocutorAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },

  inputArea: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1c1c1e', borderTopWidth: 1, borderColor: '#333' },
  replyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', padding: 10, borderBottomWidth: 1, borderColor: '#333' },
  replyBarLine: { width: 4, height: '100%', backgroundColor: '#3498db', borderRadius: 2, marginRight: 10 },
  replyBarTitle: { color: '#3498db', fontWeight: 'bold', fontSize: 12 },
  replyBarText: { color: '#aaa', fontSize: 13, flex: 1 },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderRadius: 10,
    marginBottom: 6
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff3b30', marginRight: 8 },
  recordingText: { color: '#ffb4ae', fontSize: 13 },

  formatTools: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#2c2c2e', padding: 8, borderRadius: 12, marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 2
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    lineHeight: INPUT_LINE_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
    paddingTop: INPUT_VERTICAL_PADDING / 2,
    paddingBottom: INPUT_VERTICAL_PADDING / 2
  },
  attachBtn: { padding: 8 },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3a3a3c',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6
  },
  micBtnActive: {
    backgroundColor: '#ff3b30'
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8
  },
  sendBtnActive: { backgroundColor: '#3498db' },

  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginTop: 4,
    minWidth: 220
  },
  audioRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  audioPlayButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  audioWaveformBlock: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  audioWaveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    height: WAVEFORM_MAX_HEIGHT,
    marginBottom: 4
  },
  audioWaveformGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  audioWaveformGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  audioWaveBar: {
    width: 2,
    borderRadius: 2,
    backgroundColor: '#9fc5e8'
  },
  audioWaveBarPlayed: {
    backgroundColor: '#4fc3ff'
  },
  audioDuration: { color: '#a8a8a8', fontSize: 12 },

  readReceiptOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  readUserRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  readUserName: { color: '#fff', fontSize: 13, marginRight: 6 },
  readUserAvatar: { width: 20, height: 20, borderRadius: 10 },
  extraCount: { color: '#aaa', marginLeft: 4 },

  popupOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', paddingHorizontal: 40 },
  sendOptionsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  sendOptionsPopup: {
    position: 'absolute',
    bottom: 70,
    right: 20,
    width: 240,
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4
  },
  sendOptionButton: { paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8 },
  sendOptionContent: { flexDirection: 'row', alignItems: 'center' },
  sendOptionText: { fontSize: 15, color: '#f5f5f5' },
  readUsersPopup: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#444', width: 220, maxHeight: 220 },
  readUsersPopupPersonal: { alignSelf: 'flex-end' },
  readUsersPopupInterlocutor: { alignSelf: 'flex-start' },

  userInfoPopup: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#444',
    width: 240
  },
  userInfoName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  userInfoCity: { color: '#aaa', fontSize: 13 },

  menuSeparator: { height: 1, backgroundColor: '#333', marginVertical: 6 },
  contextMenu: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 8, width: 200, borderWidth: 1, borderColor: '#444' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { color: '#eee', marginLeft: 12, fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  glassCard: { backgroundColor: '#1e1e1e', borderRadius: 20, padding: 20, width: '85%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  modalInput: { backgroundColor: '#2c2c2e', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtnCancel: { flex: 1, padding: 14, backgroundColor: '#333', borderRadius: 12, alignItems: 'center', marginRight: 10 },
  modalBtnPrimary: { flex: 1, padding: 14, backgroundColor: '#3498db', borderRadius: 12, alignItems: 'center' },
  actionBtn: { paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderColor: '#333' },

  translatedText: { fontSize: 16, color: '#fff', lineHeight: 22 },
  uploadThumb: { width: 70, height: 70, borderRadius: 10, marginRight: 10 },

  spoilerText: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, paddingHorizontal: 2 },
  spoilerHiddenText: { color: 'transparent' },

  mentionList: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 180,
    marginBottom: 8,
    paddingVertical: 6
  },
  mentionItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  mentionAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 8 },
  mentionAvatarFallback: { backgroundColor: '#444', justifyContent: 'center', alignItems: 'center' },
  mentionName: { color: '#fff', fontSize: 14 },
  mentionText: { color: '#3498db', textDecorationLine: 'underline' },

  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerTitleText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSubText: { color: '#aaa', fontSize: 12 },
  headerSoundButton: { paddingHorizontal: 12, paddingVertical: 6 },

  imageViewerContainer: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  imageViewerBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
  imageScrollView: { flex: 1 },
  imageScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '100%', height: '100%' },

  // --- compact preview (pinned/quoted) ---
  compactPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  compactThumb: { width: 26, height: 26, borderRadius: 6, marginRight: 8, backgroundColor: '#444' },
  compactPreviewText: { color: '#ccc', fontSize: 13, flex: 1 }
});

export default ChatWindow;
