// ChatWindow.js (оновлено: crash-fix + коректні превʼю pinned/quoted + pin/unpin логіка)
// ВАЖЛИВО: expo install react-native-webview

import { faYoutube } from '@fortawesome/free-brands-svg-icons';
import {
  faChartSimple,
  faCheck,
  faCheckDouble,
  faFileAlt,
  faImage,
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
import { useHeaderHeight } from '@react-navigation/elements';
import { format } from 'date-fns';
import { de, es, fr, ru, uk } from 'date-fns/locale';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
  TouchableWithoutFeedback
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import moment from 'moment-timezone';
import translateMessage, { detectMessageLanguage } from '../../translateMessage';
import { filterGbgBots, getGbgBotIds } from '../../src/utils/guildBots';
import CalendarclockIcon from '../ico/calendarclock.svg';
import ClockIcon from '../ico/clock.svg';
import TransleteIcon from '../ico/translete.svg';
import UsercheckIcon from '../ico/usercheck.svg';
import SimpleWheelPicker from '../CustomElements/SimpleWheelPicker';
import { getPresenceStatusLabel } from './presenceUtils';
import { isChatMessageVisible } from './chatDeletion';
import LinkPreviewCard, { extractPreviewUrls, getYouTubeVideoId, stripPreviewUrls } from '../CustomElements/LinkPreviewCard';
import {
  MessageReactions,
  ReactionActionIcon,
  ReactionPicker,
  toggleExclusiveUserReaction,
} from '../CustomElements/MessageReactions';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
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
const clampInputHeight = (height) =>
  Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, Number(height) || MIN_INPUT_HEIGHT));

const normalizeLanguageCode = (code) => String(code || '').trim().toLowerCase().split(/[-_]/)[0];

const isYouTubeURL = (url) => Boolean(getYouTubeVideoId(url));
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
  return extractPreviewUrls(text);
};

const stripUrls = (text = '') => {
  return stripPreviewUrls(text);
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

const SendOptionsPopup = ({
  visible,
  chatType,
  onClose,
  onSendLater,
  onSendTemporary,
  onSendToSelected,
}) => {
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
            <CalendarclockIcon width={20} height={20} fill="#9aa3b2" style={{ marginRight: 8 }} />
            <Text style={styles.sendOptionText}>Надіслати пізніше</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sendOptionButton}
          onPress={() => {
            onSendTemporary();
            onClose();
          }}
        >
          <View style={styles.sendOptionContent}>
            <ClockIcon width={20} height={20} fill="#9aa3b2" style={{ marginRight: 8 }} />
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
              <UsercheckIcon width={20} height={20} fill="#9aa3b2" style={{ marginRight: 8 }} />
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
export const RichTextWebInput = React.forwardRef(function RichTextWebInput(
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
      normalizeHeight: () => {
        setHeight(minHeight);
        inject(`window.__normalizeHeight && window.__normalizeHeight()`);
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
    html, body { margin:0; padding:0; background: transparent; overflow: hidden; }
    #editor {
      box-sizing: border-box;
      width: 100%;
      height: ${minHeight}px;
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
      overflow-y: hidden;
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
    a { color: #4ea1ff; text-decoration: underline; }
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

    function editorHasContent() {
      const text = (editor.innerText || '').replace(/\\u200B/g, '').trim();
      const markup = (editor.innerHTML || '')
        .replace(/<br\\s*\\/?>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, '')
        .trim();
      return text.length > 0 || markup.length > 0;
    }

    function measureEditorHeight() {
      editor.style.height = '${minHeight}px';

      if (!editorHasContent()) {
        editor.style.overflowY = 'hidden';
        editor.scrollTop = 0;
        return ${minHeight};
      }

      const measuredHeight = editor.scrollHeight || ${minHeight};
      const nextHeight = Math.max(${minHeight}, Math.min(${maxHeight}, measuredHeight));
      editor.style.height = nextHeight + 'px';
      editor.style.overflowY = measuredHeight > ${maxHeight} ? 'auto' : 'hidden';
      return nextHeight;
    }

    function notifyChange() {
      const html = editor.innerHTML || '';
      const text = editor.innerText || '';
      let marked = nodeToMarked(editor) || '';
      marked = marked.replace(/\\n{3,}/g, '\\n\\n').trimEnd();

      const h = measureEditorHeight();
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

    window.__normalizeHeight = () => {
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
          const hasContent = String(data.text || '').replace(/\u200B/g, '').trim().length > 0;
          if (!Number.isNaN(h)) {
            const nextHeight = hasContent
              ? Math.min(maxHeight, Math.max(minHeight, h))
              : minHeight;
            setHeight(nextHeight);
          }
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
    [maxHeight, minHeight, onChange]
  );

  return (
    <View style={{ height, minHeight, maxHeight, overflow: 'hidden' }}>
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

const normalizeMentionName = (value) => String(value || '').trim().toLowerCase();

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseMentions = (text, mentionUsers = []) => {
  if (!text) return [];
  const users = mentionUsers
    .filter((user) => user?.id && user?.userName)
    .sort((a, b) => b.userName.length - a.userName.length);
  if (!users.length) return [{ type: 'normal', content: text }];

  const usersByName = new Map(users.map((user) => [normalizeMentionName(user.userName), user]));
  const parts = [];
  const namesPattern = users.map((user) => escapeRegExp(user.userName)).join('|');
  const regex = new RegExp(`@(${namesPattern})(?![\\p{L}\\p{N}])`, 'giu');
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'normal', content: text.slice(lastIndex, match.index) });
    }
    const mentionBody = String(match[1] || '').trim();
    const mentionedUser = usersByName.get(normalizeMentionName(mentionBody));
    parts.push({
      type: 'mention',
      content: mentionBody,
      userId: mentionedUser.id
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push({ type: 'normal', content: text.slice(lastIndex) });
  return parts;
};

const parseFormattedText = (text, mentionUsers = []) => {
  const parts = [];
  let lastIndex = 0;

  const regex = /(\*\*(.*?)\*\*|__(.*?)__|_([^_]+)_|~~(.*?)~~|\|\|(.*?)\|\|)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'normal', content: parseMentions(text.slice(lastIndex, match.index), mentionUsers) });
    }
    const matchedContent = match[2] || match[3] || match[4] || match[5] || match[6];
    let type = 'normal';

    if (match[2]) type = 'bold';
    else if (match[3]) type = 'underline';
    else if (match[4]) type = 'italic';
    else if (match[5]) type = 'strikethrough';
    else if (match[6]) type = 'spoiler';

    parts.push({ type, content: parseFormattedText(matchedContent, mentionUsers) });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push({ type: 'normal', content: parseMentions(text.slice(lastIndex), mentionUsers) });
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

const renderFormattedParts = (parts, activeStyles = [], keyPrefix = '', onMentionPress) =>
  parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.type === 'spoiler') {
      const contentParts = Array.isArray(part.content) ? part.content : [{ type: 'normal', content: part.content }];
      return <Spoiler key={key}>{renderFormattedParts(contentParts, activeStyles, key, onMentionPress)}</Spoiler>;
    }

    if (part.type === 'mention') {
      return (
        <Text
          key={key}
          onPress={() => onMentionPress?.(part.userId)}
          style={[styles.mentionText, buildMentionTextStyle(activeStyles)]}
        >
          {part.content}
        </Text>
      );
    }

    const newActiveStyles = part.type === 'normal' ? activeStyles : [...activeStyles, part.type];
    const textStyle = buildTextStyle(newActiveStyles);
    const children = Array.isArray(part.content)
      ? renderFormattedParts(part.content, newActiveStyles, key, onMentionPress)
      : part.content;

    return (
      <Text key={key} style={textStyle}>
        {children}
      </Text>
    );
  });

const FormattedText = ({ text, mentionUsers, onMentionPress }) => {
  const parts = parseFormattedText(text || '', mentionUsers);
  return <Text style={styles.messageText}>{renderFormattedParts(parts, [], '', onMentionPress)}</Text>;
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
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.userInfoAvatar} />
          ) : (
            <View style={[styles.userInfoAvatar, styles.userInfoAvatarFallback]}>
              <Text style={styles.userInfoAvatarFallbackText}>{displayName.charAt(0).toUpperCase() || '?'}</Text>
            </View>
          )}
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
  const cleaned = stripUrls(text);

  const linkTypeIcon = isYouTubeURL(firstUrl) ? faYoutube : isDocsURL(firstUrl) ? getDocsIcon(firstUrl) : faLink;

  const titleForLink = cleaned || getHostLabel(firstUrl);

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
            contentContainerStyle={styles.imageScrollView}
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
                style={[styles.fullScreenImage, Platform.OS === 'android' && { transform: [{ scale: scale }] }]}
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
  const headerHeight = useHeaderHeight();
  const safeAreaInsets = useSafeAreaInsets();
  const {
    chatId,
    guildId: routeGuildId,
    messageId: initialMessageId,
  } = route.params || {};
  const [groups, setGroups] = useState([]); // групи по датах

  useEffect(() => {
    if (!chatId) return;
    const clearChatNotifications = async () => {
      try {
        const targetGuildId =
          routeGuildId || (await AsyncStorage.getItem('guildId'));
        if (!targetGuildId) return;

        const displayed = await notifee.getDisplayedNotifications();
        const chatNotifications = displayed.filter(({ notification }) => {
          const type = notification?.data?.type;
          const notificationChatId = notification?.data?.chatId;
          const notificationGuildId = notification?.data?.guildId;
          return (
            type === 'chat_message' &&
            String(notificationChatId) === String(chatId) &&
            String(notificationGuildId) === String(targetGuildId)
          );
        });

        await Promise.all(
          chatNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
        );
      } catch (error) {
        console.log('❌ Помилка очищення пушів чату:', error?.message || String(error));
      }
    };

    clearChatNotifications();
  }, [chatId, routeGuildId]);
  const [chatType, setChatType] = useState('private');
  const [headerUserId, setHeaderUserId] = useState(null);
  const [headerUser, setHeaderUser] = useState(null);
  const [groupHeader, setGroupHeader] = useState({ name: '', groupAvatar: null, memberCount: 0 });

  const [newMessage, setNewMessage] = useState('');
  const [newMessagePlain, setNewMessagePlain] = useState('');
  const [newMessageHtml, setNewMessageHtml] = useState('');
  const [, setComposerSelectionActive] = useState(false);
  const [composerCaretIndex, setComposerCaretIndex] = useState(0);
  const composerRef = useRef(null);

  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);

  const [userId, setUserId] = useState(null);
  const [guildId, setGuildId] = useState(routeGuildId || null);
  const [locale, setLocale] = useState(uk);
  const [localeCode, setLocaleCode] = useState('uk');
  const [isChatMember, setIsChatMember] = useState(false);
  const [isChatSoundEnabled, setIsChatSoundEnabled] = useState(true);
  const [chatDeletedAt, setChatDeletedAt] = useState(null);
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
  const [actionMessage, setActionMessage] = useState(null);
  const [reactionMessage, setReactionMessage] = useState(null);

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
  const languageDetectionInProgressRef = useRef(new Set());

  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [timingMode, setTimingMode] = useState('scheduled');
  const [timingDayIndex, setTimingDayIndex] = useState(0);
  const [timingHourIndex, setTimingHourIndex] = useState(0);
  const [timingMinuteIndex, setTimingMinuteIndex] = useState(0);
  const [sendOptionsPopupVisible, setSendOptionsPopupVisible] = useState(false);

  const timingDayOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const label = index === 0
      ? 'Сьогодні'
      : index === 1
        ? 'Завтра'
        : format(date, 'EEE, d MMM', { locale });
    return { date, label };
  }), [locale]);

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
  const highlightPulse = useRef(new Animated.Value(0)).current;
  const highlightAnimationRef = useRef(null);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);

  const flatListRef = useRef(null);
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const recordingMeteringsRef = useRef([]);
  const processedRead = useRef(new Set());
  const initialMessageHandledRef = useRef("");

  useEffect(() => {
    let animationFrameId = null;
    const unsubscribe = navigation.addListener('focus', () => {
      animationFrameId = requestAnimationFrame(() => {
        composerRef.current?.normalizeHeight?.();
      });
    });

    return () => {
      unsubscribe();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, [chatId, navigation]);

  useEffect(() => {
    if (!editMessageText) {
      setInputHeight(MIN_INPUT_HEIGHT);
    }
  }, [editMessageText]);

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
      const [userSnap, guildUserSnap] = await Promise.all([
        database().ref(`users/${targetUserId}`).once('value'),
        guildId
          ? database().ref(`guilds/${guildId}/guildUsers/${targetUserId}`).once('value')
          : Promise.resolve(null)
      ]);
      const data = userSnap.val() || {};
      const guildUser = guildUserSnap?.val() || {};
      setUserInfoPopupUser({
        name: data.name || guildUser.userName || '',
        city: data.city || '',
        imageUrl: guildUser.imageUrl || data.imageUrl || ''
      });
    } catch (error) {
      setUserInfoPopupUser({ name: '', city: '', imageUrl: '' });
    } finally {
      setUserInfoPopupLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    return () => {
      highlightAnimationRef.current?.stop();
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
      const gid = routeGuildId || (await AsyncStorage.getItem('guildId'));
      setUserId(uid);
      setGuildId(gid);
    })();
  }, [routeGuildId]);

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

    setChatDeletedAt(null);
    const chatRef = database().ref(`guilds/${guildId}/chats/${chatId}`);
    const listener = chatRef.on('value', async (snap) => {
      const data = snap.val();
      if (!data) return;
      setChatDeletedAt(Number(data.deletedFor?.[userId] || 0));
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
        const memberIds = Object.keys(data.members || {});
        const roleBasedBotIds = await getGbgBotIds(guildId, memberIds);
        const hiddenMemberIds = new Set([
          ...Object.keys(data.hiddenMembers || {}),
          ...roleBasedBotIds,
        ]);
        setGroupHeader({
          name: data.name || '',
          groupAvatar: data.groupAvatar || null,
          memberCount: memberIds.filter((memberId) => !hiddenMemberIds.has(String(memberId))).length
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

  const headerUserLastMessageTimestamp = useMemo(() => {
    if (!headerUserId) return 0;

    return groups.reduce(
      (latestTimestamp, group) =>
        (group.messages || []).reduce((latestInGroup, message) => {
          if (String(message?.senderId || '') !== String(headerUserId)) {
            return latestInGroup;
          }

          const timestamp = Number(
            message?.deliverySource === 'scheduled'
              ? message?.authoredAt
              : message?.timestamp
          );
          return Number.isFinite(timestamp) && timestamp > latestInGroup
            ? timestamp
            : latestInGroup;
        }, latestTimestamp),
      0
    );
  }, [groups, headerUserId]);

  useEffect(() => {
    if (chatType === 'private') {
      if (!headerUser || !headerUserId) return;
      const presenceLabel = getPresenceStatusLabel(
        headerUser.presence,
        locale,
        headerUserLastMessageTimestamp
      );
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
    headerUserLastMessageTimestamp,
    locale,
    navigation,
    renderHeaderRight
  ]);

  useEffect(() => {
    if (!guildId) return;
    const ref = database().ref(`guilds/${guildId}/guildUsers`);
    const listener = ref.on('value', async (snap) => {
      const data = await filterGbgBots(guildId, snap.val() || {});
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
    if (!chatId || !guildId || !userId || chatDeletedAt === null) return;

    const msgRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
    const listener = msgRef.on('value', (snap) => {
      const raw = snap.val() || {};
      const list = Object.entries(raw)
        .map(([id, msg]) => ({ id, ...msg }))
        .filter((message) => isChatMessageVisible(message, chatDeletedAt, userId));

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
  }, [chatDeletedAt, chatId, guildId, locale, userId]);

  // ✅ pinned тільки якщо pinnedFor[userId] === true
  const pinnedMessages = useMemo(() => {
    const all = groups.flatMap((g) => g.messages);
    const pinned = all.filter((m) => !!m?.pinned?.pinnedFor?.[userId]);
    // ✅ сорт: найсвіжіші -> найстаріші
    return pinned.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }, [groups, userId]);

  useEffect(() => {
    setActivePinnedIndex((current) =>
      Math.min(current, Math.max(0, pinnedMessages.length - 1))
    );
  }, [pinnedMessages.length]);

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
    highlightAnimationRef.current?.stop();
    highlightPulse.setValue(0);
    setHighlightedMessageId(messageId);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(highlightPulse, {
          toValue: 1,
          duration: 360,
          useNativeDriver: false,
        }),
        Animated.timing(highlightPulse, {
          toValue: 0,
          duration: 360,
          useNativeDriver: false,
        }),
      ]),
      { iterations: 6 }
    );
    highlightAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (finished) setHighlightedMessageId(null);
    });
  }, [highlightPulse]);

  const scrollToMessage = useCallback(
    (messageId) => {
      const index = messageIndexMap[messageId];
      if (index === undefined || index === null || !flatListRef.current) {
        return false;
      }

      try {
        flatListRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5
        });
        highlightMessage(messageId);
        return true;
      } catch (_error) {
        return false;
      }
    },
    [messageIndexMap, highlightMessage]
  );

  useEffect(() => {
    if (!initialMessageId) return;
    if (initialMessageHandledRef.current === String(initialMessageId)) return;
    if (messageIndexMap[initialMessageId] === undefined) return;

    let cancelled = false;
    let timer;
    let attempts = 0;

    const tryInitialScroll = () => {
      if (cancelled) return;
      if (scrollToMessage(initialMessageId)) {
        initialMessageHandledRef.current = String(initialMessageId);
        return;
      }

      attempts += 1;
      if (attempts < 5) {
        timer = setTimeout(tryInitialScroll, 200);
      }
    };

    timer = setTimeout(tryInitialScroll, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initialMessageId, messageIndexMap, scrollToMessage]);

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

  const toggleMessageReaction = useCallback(async (message, reactionKey) => {
    if (!guildId || !chatId || !message?.id || !userId || !reactionKey) return;
    try {
      await database()
        .ref(`guilds/${guildId}/chats/${chatId}/messages/${message.id}/reactions`)
        .transaction((current) => toggleExclusiveUserReaction(current, userId, reactionKey));
    } catch (error) {
      console.warn('Не вдалося змінити реакцію:', error?.message || String(error));
    }
  }, [chatId, guildId, userId]);

  const cacheMessageLanguage = useCallback(
    async (messageId, text) => {
      const sourceText = stripUrls(String(text || '')).trim();
      if (!messageId || !sourceText || !guildId || !chatId) return null;
      if (languageDetectionInProgressRef.current.has(messageId)) return null;

      languageDetectionInProgressRef.current.add(messageId);
      try {
        const language = await detectMessageLanguage(sourceText);
        if (language) {
          await database()
            .ref(`guilds/${guildId}/chats/${chatId}/messages/${messageId}/language`)
            .set(normalizeLanguageCode(language));
        }
        return language;
      } catch (error) {
        console.warn('Не вдалося визначити мову повідомлення:', error?.message || String(error));
        return null;
      } finally {
        languageDetectionInProgressRef.current.delete(messageId);
      }
    },
    [chatId, guildId]
  );

  const handleMessageMenuOpen = useCallback(
    (message, isOwnMessage) => {
      const sourceText = (message?.text || '').trim() || stripHtml(message?.html);
      if (isOwnMessage || message?.language || !sourceText) return;
      cacheMessageLanguage(message.id, sourceText);
    },
    [cacheMessageLanguage]
  );

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
      timestamp: database.ServerValue.TIMESTAMP,
      status: 'sent'
    });
    cacheMessageLanguage(ref.key, imageCaption);
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
        timestamp: database.ServerValue.TIMESTAMP,
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

  const openTimingPicker = (mode) => {
    if (!newMessage.trim()) {
      Alert.alert('Помилка', 'Спочатку введіть текст повідомлення.');
      return;
    }
    const initialDate = new Date(Date.now() + 5 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const initialDay = new Date(initialDate);
    initialDay.setHours(0, 0, 0, 0);
    setTimingMode(mode);
    setTimingDayIndex(Math.max(0, Math.min(6, Math.round((initialDay - today) / 86400000))));
    setTimingHourIndex(initialDate.getHours());
    setTimingMinuteIndex(initialDate.getMinutes());
    setIsDatePickerVisible(true);
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
      authoredAt: database.ServerValue.TIMESTAMP,
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

  const handleTemporarySend = async (expiresAt) => {
    setIsDatePickerVisible(false);
    if (!newMessage.trim() || !guildId || !chatId || !userId) return;
    if (expiresAt.getTime() <= Date.now()) {
      Alert.alert('Невірний час', 'Час видалення має бути в майбутньому.');
      return;
    }

    const messageRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`).push();
    const messageId = messageRef.key;
    const messageData = {
      senderId: userId,
      text: newMessage,
      html: newMessageHtml || null,
      timestamp: database.ServerValue.TIMESTAMP,
      status: 'sent',
      deliverySource: 'temporary',
      expiresAt: expiresAt.getTime(),
      replyTo: replyToMessage?.id || null,
    };

    try {
      await database().ref(`guilds/${guildId}`).update({
        [`chats/${chatId}/messages/${messageId}`]: messageData,
        [`temporaryMessages/${messageId}`]: {
          chatId,
          expiresAt: expiresAt.getTime(),
          status: 'pending',
        },
      });
      cacheMessageLanguage(messageId, newMessage);
      setNewMessage('');
      setNewMessagePlain('');
      setNewMessageHtml('');
      setReplyToMessage(null);
      setComposerSelectionActive(false);
      composerRef.current?.clear?.();
      Alert.alert('Надіслано', `Повідомлення буде видалено ${format(expiresAt, 'dd.MM.yyyy о HH:mm')}`);
    } catch (error) {
      Alert.alert('Помилка', error?.message || 'Не вдалося надіслати тимчасове повідомлення.');
    }
  };

  const handleTimingConfirm = () => {
    const selectedDay = timingDayOptions[timingDayIndex]?.date || new Date();
    const selectedDate = new Date(selectedDay);
    selectedDate.setHours(timingHourIndex, timingMinuteIndex, 0, 0);
    if (timingMode === 'temporary') {
      handleTemporarySend(selectedDate);
    } else {
      handleScheduleSend(selectedDate);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() && !editMessage) return;

    if (editMessage) {
      await database().ref(`guilds/${guildId}/chats/${chatId}/messages/${editMessage.id}`).update({
        text: editMessageText,
        edited: true
      });
      cacheMessageLanguage(editMessage.id, editMessageText);
      setEditMessage(null);
      setEditMessageText('');
      setInputHeight(MIN_INPUT_HEIGHT);
      return;
    }

    const ref = database().ref(`guilds/${guildId}/chats/${chatId}/messages`).push();
    await ref.set({
      senderId: userId,
      text: newMessage,
      html: newMessageHtml || null,
      timestamp: database.ServerValue.TIMESTAMP,
      status: 'sent',
      replyTo: replyToMessage?.id || null
    });
    cacheMessageLanguage(ref.key, newMessage);

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
    if (
      normalizeLanguageCode(message.language) &&
      normalizeLanguageCode(message.language) === normalizeLanguageCode(localeCode)
    ) {
      return;
    }
    const sourceText = (message.text || '').trim() || stripHtml(message.html);
    if (!sourceText) {
      Alert.alert('Помилка', 'Немає тексту для перекладу.');
      return;
    }
    try {
      const translationRef = database().ref(
        `guilds/${guildId}/chats/${chatId}/messages/${message.id}/translateSafe/${localeCode}`
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

  return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f1115' }} edges={['right', 'left']}>
        <StatusBar barStyle="light-content" backgroundColor="#0f1115" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={headerHeight}
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
                    const page = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                    setActivePinnedIndex(page);
                    const msg = pinnedMessages[page];
                    if (msg?.id) scrollToMessage(msg.id);
                  }}
                >
                  {pinnedMessages.map((msg) => (
                    <TouchableOpacity
                      key={msg.id}
                      style={styles.pinnedItemPage}
                      activeOpacity={0.9}
                      onPress={() => msg?.id && scrollToMessage(msg.id)}
                    >
                      <View style={styles.pinnedItemInner}>
                        <View style={styles.pinnedRail}>
                          {pinnedMessages.map((pinnedMessage, segmentIndex) => (
                            <View
                              key={pinnedMessage.id}
                              style={[
                                styles.pinnedRailSegment,
                                segmentIndex === activePinnedIndex && styles.pinnedRailSegmentActive,
                              ]}
                            />
                          ))}
                        </View>

                        {/* ✅ "Закріплено" і текст — різні рядки */}
                        <View style={styles.pinnedTextContainer}>
                          <Text style={styles.pinnedLabel}>Закріплено</Text>

                          {/* ✅ превʼю без "Посилання", без "youtu.be" як fallback (беремо title), з thumbnail для фото */}
                          <CompactMessagePreview message={msg} lines={1} />
                        </View>

                        <TouchableOpacity
                          accessibilityLabel="Відкріпити повідомлення"
                          accessibilityRole="button"
                          activeOpacity={0.7}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            setSelectedMessageId(msg.id);
                            setMessageToPin(msg);
                            if (msg?.pinned?.forAll) setUnpinModalVisible(true);
                            else handleUnpin(false, msg);
                          }}
                          style={styles.pinnedUnpinButton}
                        >
                          <FontAwesomeIcon icon={faThumbtack} size={18} color="#9aa3b2" />
                          <View style={styles.pinnedUnpinLines}>
                            <View style={styles.pinnedUnpinLine} />
                            <View style={styles.pinnedUnpinLine} />
                            <View style={styles.pinnedUnpinLine} />
                          </View>
                        </TouchableOpacity>
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
                const uniqueUrls = Array.from(new Set(allUrls)).slice(0, 3);

                const isHighlighted = highlightedMessageId === msg.id;

                const isPinnedForMe = !!msg?.pinned?.pinnedFor?.[userId];
                return (
                  <View style={[styles.messageRow, isMe ? styles.rowRight : styles.rowLeft]}>
                    {!isMe && showAvatar && (
                      <TouchableOpacity activeOpacity={0.7} onPress={() => handleOpenUserInfo(msg.senderId)}>
                        <InterlocutorAvatar senderId={msg.senderId} guildId={guildId} />
                      </TouchableOpacity>
                    )}
                    {!isMe && !showAvatar && chatType === 'group' && <View style={{ width: 40 }} />}

                      <TouchableOpacity
                        activeOpacity={0.86}
                        onPress={() => setSelectedMessageId(msg.id)}
                        onLongPress={() => {
                          handleMessageMenuOpen(msg, isMe);
                          setSelectedMessageId(msg.id);
                          setActionMessage(msg);
                        }}
                      >
                        <Animated.View
                          style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                            msg.replyTo ? styles.bubbleReply : null,
                            isHighlighted ? styles.bubbleHighlighted : null,
                            isHighlighted
                              ? {
                                  borderColor: highlightPulse.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['#4ea1ff', '#d8ecff'],
                                  }),
                                  shadowOpacity: highlightPulse.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.1, 0.9],
                                  }),
                                }
                              : null,
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

                          {!!messageText && (
                            <FormattedText
                              text={messageText}
                              mentionUsers={guildMembers}
                              onMentionPress={handleOpenUserInfo}
                            />
                          )}

                          {uniqueUrls.map((u) => (
                            <LinkPreviewCard key={`h_${msg.id}_${u}`} url={u} />
                          ))}

                          <MessageReactions
                            reactions={msg.reactions}
                            currentUserId={userId}
                            onToggle={(reactionKey) => toggleMessageReaction(msg, reactionKey)}
                          />

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
                        </Animated.View>
                      </TouchableOpacity>

                      {readUsersPopupFor === msg.id && (
                        <ReadUsersPopup
                          message={msg}
                          guildId={guildId}
                          isCurrentUser={isMe}
                          onClose={() => setReadUsersPopupFor(null)}
                        />
                      )}
                  </View>
                );
              }}
            />

            <Modal
              visible={Boolean(actionMessage)}
              transparent
              animationType="fade"
              onRequestClose={() => setActionMessage(null)}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={styles.actionOverlay}
                onPress={() => setActionMessage(null)}
              >
                <View
                  style={[
                    styles.actionSheet,
                    { paddingBottom: Math.max(26, safeAreaInsets.bottom + 12) },
                  ]}
                >
                  <View style={styles.actionHandle} />
                  <Text style={styles.actionTitle}>Дії з повідомленням</Text>
                  {renderGroupReadReceiptOption(actionMessage)}
                  {renderReadReceiptOption(actionMessage)}

                  {[
                    {
                      label: 'Додати реакцію',
                      reactionIcon: true,
                      show: true,
                      action: () => setReactionMessage(actionMessage),
                    },
                    {
                      label: 'Відповісти',
                      icon: faReply,
                      show: true,
                      action: () => handleReply(actionMessage),
                    },
                    {
                      label: 'Копіювати',
                      icon: faCopy,
                      show: Boolean(actionMessage?.text),
                      action: () => Clipboard.setString(actionMessage?.text || ''),
                    },
                    {
                      label: 'Редагувати',
                      icon: faPen,
                      show: actionMessage?.senderId === userId && Boolean(actionMessage?.text),
                      action: () => {
                        setEditMessage(actionMessage);
                        setEditMessageText(actionMessage?.text || '');
                        setInputHeight(MIN_INPUT_HEIGHT);
                        composerRef.current?.clear?.();
                        setNewMessage('');
                        setNewMessageHtml('');
                      },
                    },
                    {
                      label: actionMessage?.pinned?.pinnedFor?.[userId] ? 'Відкріпити' : 'Закріпити',
                      icon: faThumbtack,
                      show: true,
                      action: () => {
                        const message = actionMessage;
                        const pinnedForMe = Boolean(message?.pinned?.pinnedFor?.[userId]);
                        const pinnedForAll = Boolean(message?.pinned?.forAll);
                        setSelectedMessageId(message?.id);
                        setMessageToPin(message);
                        if (pinnedForMe) {
                          if (pinnedForAll) setUnpinModalVisible(true);
                          else handleUnpin(false, message);
                        } else {
                          setPinModalVisible(true);
                        }
                      },
                    },
                    {
                      label: 'Перекласти',
                      translateIcon: true,
                      show:
                        actionMessage?.senderId !== userId &&
                        Boolean(actionMessage?.text) &&
                        normalizeLanguageCode(actionMessage?.language) !== normalizeLanguageCode(localeCode),
                      action: () => handleTranslate(actionMessage),
                    },
                    {
                      label: 'Видалити',
                      icon: faTrash,
                      destructive: true,
                      show: actionMessage?.senderId === userId,
                      action: () => {
                        setMessageToDelete(actionMessage);
                        setSelectedMessageId(actionMessage?.id);
                        setDeleteModalVisible(true);
                      },
                    },
                  ]
                    .filter((item) => item.show)
                    .map((item) => (
                      <TouchableOpacity
                        key={item.label}
                        style={styles.actionRow}
                        onPress={() => {
                          const action = item.action;
                          setActionMessage(null);
                          action();
                        }}
                      >
                        {item.reactionIcon ? (
                          <ReactionActionIcon />
                        ) : item.translateIcon ? (
                          <TransleteIcon width={19} height={19} fill="#f4f7fb" />
                        ) : (
                          <FontAwesomeIcon
                            icon={item.icon}
                            size={18}
                            color={item.destructive ? '#ff7070' : '#f4f7fb'}
                          />
                        )}
                        <Text style={[styles.actionText, item.destructive && styles.actionTextDestructive]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </TouchableOpacity>
            </Modal>

            <ReactionPicker
              visible={Boolean(reactionMessage)}
              onClose={() => setReactionMessage(null)}
              onSelect={(reactionKey) => {
                const message = reactionMessage;
                setReactionMessage(null);
                toggleMessageReaction(message, reactionKey);
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

              {!editMessage && (
                <View style={styles.composerToolbar}>
                  <TouchableOpacity
                    accessibilityLabel="Додати зображення"
                    style={styles.composerToolButton}
                    onPress={pickImage}
                  >
                    <FontAwesomeIcon icon={faImage} color="#9aa3b2" size={19} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel="Згадати учасника"
                    style={styles.composerToolButton}
                    onPress={() => composerRef.current?.replaceRange?.(composerCaretIndex, composerCaretIndex, '@')}
                  >
                    <Text style={styles.mentionToolText}>@</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityLabel="Жирний" style={styles.composerToolButton} onPress={() => composerRef.current?.cmd?.('bold')}>
                    <FontAwesomeIcon icon={faBold} color="#9aa3b2" size={18} />
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityLabel="Курсив" style={styles.composerToolButton} onPress={() => composerRef.current?.cmd?.('italic')}>
                    <FontAwesomeIcon icon={faItalic} color="#9aa3b2" size={18} />
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityLabel="Підкреслений" style={styles.composerToolButton} onPress={() => composerRef.current?.cmd?.('underline')}>
                    <FontAwesomeIcon icon={faUnderline} color="#9aa3b2" size={18} />
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityLabel="Закреслений" style={styles.composerToolButton} onPress={() => composerRef.current?.cmd?.('strikeThrough')}>
                    <FontAwesomeIcon icon={faStrikethrough} color="#9aa3b2" size={18} />
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
                      { height: clampInputHeight(inputHeight) }
                    ]}
                    value={editMessageText}
                    onChangeText={setEditMessageText}
                    onSelectionChange={({ nativeEvent: { selection } }) => setSelection(selection)}
                    onContentSizeChange={(e) => {
                      const contentHeight = editMessageText.trim()
                        ? e.nativeEvent.contentSize.height
                        : MIN_INPUT_HEIGHT;
                      setInputHeight(clampInputHeight(contentHeight));
                    }}
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
                onSendLater={() => openTimingPicker('scheduled')}
                onSendTemporary={() => openTimingPicker('temporary')}
                onSendToSelected={() => Alert.alert('Функція', 'Надіслати обраним')}
              />
            </View>

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

        <Modal
          animationType="slide"
          transparent
          visible={isDatePickerVisible}
          onRequestClose={() => setIsDatePickerVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsDatePickerVisible(false)}>
            <View style={styles.timingModalOverlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.timingModalCard,
                    { paddingBottom: Math.max(20, safeAreaInsets.bottom + 12) },
                  ]}
                >
                  <View style={styles.timingModalHandle} />
                  <Text style={styles.timingModalTitle}>
                    {timingMode === 'temporary'
                      ? 'Тимчасове повідомлення'
                      : 'Надіслати пізніше'}
                  </Text>
                  <Text style={styles.timingModalHint}>
                    {timingMode === 'temporary'
                      ? 'Оберіть час автоматичного видалення'
                      : 'Оберіть час відправлення'}
                  </Text>
                  <View style={styles.timingWheelRow}>
                    <View style={styles.timingDayWheel}>
                      <SimpleWheelPicker
                        data={timingDayOptions.map((item) => item.label)}
                        selectedIndex={timingDayIndex}
                        onValueChange={(_, index) => setTimingDayIndex(index)}
                      />
                    </View>
                    <View style={styles.timingNumberWheel}>
                      <SimpleWheelPicker
                        data={Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))}
                        selectedIndex={timingHourIndex}
                        onValueChange={(_, index) => setTimingHourIndex(index)}
                      />
                    </View>
                    <Text style={styles.timingSeparator}>:</Text>
                    <View style={styles.timingNumberWheel}>
                      <SimpleWheelPicker
                        data={Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))}
                        selectedIndex={timingMinuteIndex}
                        onValueChange={(_, index) => setTimingMinuteIndex(index)}
                      />
                    </View>
                  </View>
                  <View style={styles.timingModalActions}>
                    <TouchableOpacity
                      onPress={() => setIsDatePickerVisible(false)}
                      style={styles.timingCancelButton}
                    >
                      <Text style={styles.timingCancelText}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleTimingConfirm} style={styles.timingConfirmButton}>
                      <Text style={styles.timingConfirmText}>Підтвердити</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },

  // pinned
  pinnedContainer: {
    backgroundColor: '#152330',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#36516a',
    overflow: 'hidden'
  },
  pinnedItemPage: { width: screenWidth, paddingHorizontal: 10 },

  // ✅ робимо контейнер рядком: сегментована шкала + текст + дія
  pinnedItemInner: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  pinnedRail: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: 5,
    marginRight: 10,
    gap: 2,
  },
  pinnedRailSegment: {
    flex: 1,
    maxHeight: 12,
    minHeight: 3,
    backgroundColor: 'rgba(78,161,255,0.38)',
    borderRadius: 3,
  },
  pinnedRailSegmentActive: { backgroundColor: '#4ea1ff' },
  pinnedTextContainer: { flex: 1, minWidth: 0 },
  pinnedLabel: { color: '#4ea1ff', fontSize: 11, fontWeight: 'bold' },
  pinnedUnpinButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginLeft: 8,
    minHeight: 40,
    minWidth: 52,
    paddingHorizontal: 8,
  },
  pinnedUnpinLines: { gap: 3, marginLeft: 5 },
  pinnedUnpinLine: {
    backgroundColor: '#9aa3b2',
    borderRadius: 1,
    height: 2,
    width: 13,
  },

  dateBadgeContainer: { alignItems: 'center', marginVertical: 15 },
  dateBadge: {
    backgroundColor: '#1b2b3b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    color: '#aaa',
    fontSize: 12
  },

  messageRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 4 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  bubble: { maxWidth: screenWidth * 0.78, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginBottom: 3 },
  bubbleReply: { width: screenWidth * 0.75 },
  bubbleMe: {
    backgroundColor: '#17354a',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#4ea1ff'
  },
  bubbleThem: {
    backgroundColor: '#1b2732',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#36516a'
  },

  // підсвітка знайденого/цільового повідомлення
  bubbleHighlighted: {
    borderColor: '#4ea1ff',
    borderWidth: 3,
    elevation: 8,
    shadowColor: '#4ea1ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },

  senderName: { color: '#4ea1ff', fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
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
  quotedLine: { width: 3, backgroundColor: '#4ea1ff', borderRadius: 2, marginRight: 8 },
  quotedContent: { flex: 1 },
  quotedTitle: { color: '#4ea1ff', fontSize: 11, fontWeight: '700', marginBottom: 4 },

  interlocutorAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },

  inputArea: { paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#15202b', borderTopWidth: 1, borderColor: '#36516a' },
  replyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', padding: 10, borderBottomWidth: 1, borderColor: '#333' },
  replyBarLine: { width: 4, height: '100%', backgroundColor: '#4ea1ff', borderRadius: 2, marginRight: 10 },
  replyBarTitle: { color: '#4ea1ff', fontWeight: 'bold', fontSize: 12 },
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

  formatTools: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#1b2b3b', padding: 8, borderRadius: 12, marginBottom: 8 },
  composerToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    borderBottomColor: '#36516a',
    borderBottomWidth: 1,
    marginBottom: 7,
    paddingBottom: 6,
  },
  composerToolButton: { alignItems: 'center', height: 34, justifyContent: 'center', minWidth: 42 },
  mentionToolText: { color: '#9aa3b2', fontSize: 25, fontWeight: '600', lineHeight: 28 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b2b3b',
    borderColor: '#36516a',
    borderRadius: 24,
    borderWidth: 1,
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
    backgroundColor: '#263b4e',
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
    backgroundColor: '#263b4e',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8
  },
  sendBtnActive: { backgroundColor: '#4ea1ff' },

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
    backgroundColor: '#4ea1ff',
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
  actionOverlay: {
    backgroundColor: 'rgba(0,0,0,0.68)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#152330',
    borderColor: '#36516a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: 26,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  actionHandle: {
    alignSelf: 'center',
    backgroundColor: '#52677a',
    borderRadius: 2,
    height: 4,
    marginBottom: 12,
    width: 42,
  },
  actionTitle: {
    color: '#9aa3b2',
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 8,
    paddingHorizontal: 10,
  },
  actionRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  actionText: { color: '#f4f7fb', fontSize: 15, marginLeft: 14 },
  actionTextDestructive: { color: '#ff7070' },
  sendOptionsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  sendOptionsPopup: {
    position: 'absolute',
    bottom: 70,
    right: 20,
    width: 240,
    backgroundColor: '#152330',
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
  readUsersPopup: { backgroundColor: '#152330', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#444', width: 220, maxHeight: 220 },
  readUsersPopupPersonal: { alignSelf: 'flex-end' },
  readUsersPopupInterlocutor: { alignSelf: 'flex-start' },

  userInfoPopup: {
    backgroundColor: '#152330',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#444',
    width: 240
  },
  userInfoAvatar: { width: 64, height: 64, borderRadius: 32, alignSelf: 'center', marginBottom: 12 },
  userInfoAvatarFallback: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  userInfoAvatarFallbackText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  userInfoName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  userInfoCity: { color: '#aaa', fontSize: 13, textAlign: 'center' },

  menuSeparator: { height: 1, backgroundColor: '#333', marginVertical: 6 },
  contextMenu: { backgroundColor: '#152330', borderRadius: 12, padding: 8, width: 200, borderWidth: 1, borderColor: '#444' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { color: '#eee', marginLeft: 12, fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  glassCard: { backgroundColor: '#152330', borderRadius: 20, padding: 20, width: '85%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  modalInput: { backgroundColor: '#1b2b3b', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtnCancel: { flex: 1, padding: 14, backgroundColor: '#333', borderRadius: 12, alignItems: 'center', marginRight: 10 },
  modalBtnPrimary: { flex: 1, padding: 14, backgroundColor: '#4ea1ff', borderRadius: 12, alignItems: 'center' },
  actionBtn: { paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderColor: '#333' },

  timingModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  timingModalCard: {
    backgroundColor: '#152330',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#36516a',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  timingModalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#36516a',
    marginBottom: 16,
  },
  timingModalTitle: { color: '#f4f7fb', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  timingModalHint: { color: '#9aa3b2', fontSize: 13, textAlign: 'center', marginTop: 6 },
  timingWheelRow: {
    height: 180,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timingDayWheel: { width: 185, height: 180, overflow: 'hidden' },
  timingNumberWheel: { width: 58, height: 180, overflow: 'hidden' },
  timingSeparator: { color: '#9aa3b2', fontSize: 22, marginHorizontal: 1 },
  timingModalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  timingCancelButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#1b2b3b',
    borderWidth: 1,
    borderColor: '#36516a',
  },
  timingConfirmButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#4ea1ff',
  },
  timingCancelText: { color: '#d5dbe5', fontSize: 15, fontWeight: '700' },
  timingConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  translatedText: { fontSize: 16, color: '#fff', lineHeight: 22 },
  uploadThumb: { width: 70, height: 70, borderRadius: 10, marginRight: 10 },

  spoilerText: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, paddingHorizontal: 2 },
  spoilerHiddenText: { color: 'transparent' },

  mentionList: {
    backgroundColor: '#152330',
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
  mentionText: { color: '#4ea1ff', textDecorationLine: 'underline' },

  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10, borderWidth: 2, borderColor: '#4ea1ff' },
  headerTitleText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSubText: { color: '#9aa3b2', fontSize: 12 },
  headerSoundButton: { marginRight: 8, padding: 10, borderRadius: 12, backgroundColor: '#152b3d', borderWidth: 1, borderColor: '#36516a' },

  imageViewerContainer: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  imageViewerBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
  imageScrollView: { flexGrow: 1, justifyContent: 'center' },
  fullScreenImage: { width: screenWidth, height: screenHeight * 0.8 },

  // --- compact preview (pinned/quoted) ---
  compactPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  compactThumb: { width: 26, height: 26, borderRadius: 6, marginRight: 8, backgroundColor: '#444' },
  compactPreviewText: { color: '#ccc', fontSize: 13, flex: 1 }
});

export default ChatWindow;
