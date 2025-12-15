// ChatWindow.js (повністю перероблений під Rich-композер у WebView, без маркувань у полі вводу)
// ВАЖЛИВО: для роботи потрібно встановити: expo install react-native-webview

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
  faLink
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { de, es, fr, ru, uk } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
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
  TouchableWithoutFeedback
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, MenuOption, MenuOptions, MenuProvider, MenuTrigger } from 'react-native-popup-menu';
import uuid from 'react-native-uuid';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import DatePicker from 'react-native-date-picker';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const locales = { uk, ru, es, fr, de };

const INPUT_LINE_HEIGHT = 20;
const INPUT_VERTICAL_PADDING = 8; // paddingTop 4 + paddingBottom 4
const INPUT_MAX_LINES = 5;
const MIN_INPUT_HEIGHT = INPUT_LINE_HEIGHT + INPUT_VERTICAL_PADDING;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * INPUT_MAX_LINES + INPUT_VERTICAL_PADDING;

const isYouTubeURL = (url) => url.includes('youtube.com') || url.includes('youtu.be');
const isDocsURL = (url) => url.includes('docs.google.com');

const getDocsIcon = (url) => {
  if (url.includes('/document/')) return faFileAlt;
  if (url.includes('/spreadsheets/')) return faTableCellsLarge;
  if (url.includes('/presentation/')) return faChartSimple;
  return null;
};

const normalizeUrl = (u) => {
  const url = (u || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
};

const extractUrlsFromHtml = (html = '') => {
  if (!html) return [];
  const out = [];
  const regex = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    out.push(match[1]);
  }
  // унікальні
  return Array.from(new Set(out));
};

// --------------------
// Rich Text Web Input (WebView + contenteditable)
// Повертає:
// - html: innerHTML
// - text: innerText
// - marked: сумісний рядок з маркерами (** _ __ ~~ ||) для вашого FormattedText
// - selectionActive: чи є виділення всередині редактора (для показу панелі форматування як раніше)
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
      clear: () => {
        setHeight(minHeight);
        inject(`window.__clear && window.__clear()`);
      },
      focus: () => inject(`window.__focus && window.__focus()`)
    }),
    [inject, minHeight]
  );

  const editorHTML = React.useMemo(() => {
    // NOTE: placeholder реалізовано через :empty:before
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
      // Text node
      if (node.nodeType === 3) return node.nodeValue || '';
      // Element node
      if (node.nodeType !== 1) return '';

      const tag = (node.tagName || '').toLowerCase();

      if (tag === 'br') return '\\n';

      let inner = '';
      const children = node.childNodes ? Array.from(node.childNodes) : [];
      for (const ch of children) inner += nodeToMarked(ch);

      // block-ish
      if (tag === 'div' || tag === 'p') return inner + '\\n';

      // styles
      if (tag === 'b' || tag === 'strong') return '**' + inner + '**';
      if (tag === 'i' || tag === 'em') return '_' + inner + '_';
      if (tag === 'u') return '__' + inner + '__';
      if (tag === 's' || tag === 'del' || tag === 'strike') return '~~' + inner + '~~';

      // spoiler
      if (tag === 'span' && node.classList && node.classList.contains('spoiler')) {
        return '||' + inner + '||';
      }

      // link: у "marked" повертаємо тільки видимий текст (href беремо з html при рендері превʼю)
      if (tag === 'a') {
        return inner;
      }

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

    function notifyChange() {
      const html = editor.innerHTML || '';
      const text = editor.innerText || '';
      let marked = nodeToMarked(editor) || '';
      marked = marked.replace(/\\n{3,}/g, '\\n\\n').trimEnd();

      const h = Math.max(${minHeight}, Math.min(${maxHeight}, (editor.scrollHeight || ${minHeight})));
      const selActive = selectionActiveInEditor();

      post('change', { html, text, marked, height: h, selActive });
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
        // якщо нема селекшна — вставимо сам url як текст (і так спрацює ваш urlRegex)
        editor.appendChild(document.createTextNode(u));
        notifyChange();
        return;
      }

      const range = sel.getRangeAt(0);

      // Якщо селекшн пустий — вставляємо URL як лінк (видимий текст = URL)
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

      // Якщо є виділення — робимо лінк на виділений текст (видимий текст лишається як є)
      try {
        document.execCommand('createLink', false, u);
      } catch(e) {}

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

    document.addEventListener('selectionchange', () => {
      // щоб не спамити надто часто, просто викликаємо notifyChange
      // (він і так легкий)
      notifyChange();
    });

    // spoiler reveal in editor
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
              selectionActive: !!data.selActive
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
const Spoiler = ({ content }) => {
  const [visible, setVisible] = useState(false);
  return (
    <TouchableOpacity onPress={() => setVisible(!visible)} activeOpacity={0.9} style={styles.spoilerWrapper}>
      <View style={[styles.spoilerContainer, !visible && styles.spoilerHidden]}>
        <Text style={[styles.messageText, !visible && { opacity: 0 }]}>{content}</Text>
        {!visible && (
          <View style={styles.spoilerOverlay}>
            <FontAwesomeIcon icon={faEyeSlash} size={14} color="#ccc" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const parseFormattedText = (text) => {
  const parts = [];
  let lastIndex = 0;

  // FIX: strikethrough має бути ~~text~~ (бо кнопка вставляє "~~")
  const regex = /(\*\*(.*?)\*\*|__(.*?)__|_([^_]+)_|~~(.*?)~~|\|\|(.*?)\|\|)/g;

  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'normal', content: text.slice(lastIndex, match.index) });
    }
    if (match[2]) parts.push({ type: 'bold', content: match[2] });
    else if (match[3]) parts.push({ type: 'underline', content: match[3] });
    else if (match[4]) parts.push({ type: 'italic', content: match[4] });
    else if (match[5]) parts.push({ type: 'strikethrough', content: match[5] });
    else if (match[6]) parts.push({ type: 'spoiler', content: match[6] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'normal', content: text.slice(lastIndex) });
  }
  return parts;
};

const FormattedText = ({ text }) => {
  const parts = parseFormattedText(text || '');
  return (
    <Text style={styles.messageText}>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'bold':
            return (
              <Text key={i} style={{ fontWeight: 'bold' }}>
                {part.content}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={{ fontStyle: 'italic' }}>
                {part.content}
              </Text>
            );
          case 'underline':
            return (
              <Text key={i} style={{ textDecorationLine: 'underline' }}>
                {part.content}
              </Text>
            );
          case 'strikethrough':
            return (
              <Text key={i} style={{ textDecorationLine: 'line-through', opacity: 0.7 }}>
                {part.content}
              </Text>
            );
          case 'spoiler':
            return <Spoiler key={i} content={part.content} />;
          default:
            return <Text key={i}>{part.content}</Text>;
        }
      })}
    </Text>
  );
};

const splitMessageIntoParts = (text = '') => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'link', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return parts;
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
          title: ogTitle || title,
          description: isYouTubeURL(url) ? '' : ogDesc || '',
          image: isYouTubeURL(url) ? null : ogImage
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
      {isYouTubeURL(url) && (
        <View style={styles.mediaIconBadge}>
          <FontAwesomeIcon icon={faYoutube} size={14} color="#FFF" />
        </View>
      )}
      {isDocsURL(url) && (
        <View style={[styles.mediaIconBadge, { backgroundColor: '#4285F4' }]}>
          <FontAwesomeIcon icon={getDocsIcon(url)} size={14} color="#FFF" />
        </View>
      )}
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
        .catch((e) => console.error('Error fetching user info', e));
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
        .catch((e) => console.error('Error fetching user info', e));
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

const QuotedMessage = ({ replyTo, guildId, chatId, minimal = false }) => {
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

  const hasImage = quoted.imageUrls?.length > 0;
  const hasLink = quoted.text && /https?:\/\//.test(quoted.text);
  const displayText = quoted.text?.replace(/https?:\/\/[^\s]+/g, '').trim() || (hasImage ? 'Фото' : 'Медіа');

  return (
    <View style={[styles.quotedContainer, minimal && styles.quotedMinimal]}>
      <View style={styles.quotedLine} />
      <View style={styles.quotedContent}>
        <Text style={styles.quotedTitle}>Відповідь</Text>
        <View style={styles.quotedBody}>
          {hasImage && <Image source={{ uri: quoted.imageUrls[0] }} style={styles.quotedImageThumb} />}
          {hasLink && <FontAwesomeIcon icon={faPaperclip} size={14} color="#aaa" />}
          <Text style={styles.quotedText} numberOfLines={1}>
            {displayText}
          </Text>
        </View>
      </View>
    </View>
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
    } catch (error) {
      console.log(error);
    }
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
            <TouchableOpacity onPress={() => setScale((prev) => (prev > 1 ? 1 : 2))} style={[styles.imageViewerBtn, { marginRight: 10 }]}>
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
  const { chatId } = route.params || {};
  const [messages, setMessages] = useState([]);

  // NEW: новий композер дає marked(text) + html
  const [newMessage, setNewMessage] = useState('');
  const [newMessageHtml, setNewMessageHtml] = useState('');
  const [composerSelectionActive, setComposerSelectionActive] = useState(false);
  const composerRef = useRef(null);

  // Старі стани для edit mode (залишаємо як було)
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);

  const [userId, setUserId] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [chatType, setChatType] = useState('private');
  const [locale] = useState(uk);

  const [selectedImageUris, setSelectedImageUris] = useState([]);
  const [imageCaption, setImageCaption] = useState('');
  const [captionModalVisible, setCaptionModalVisible] = useState(false);

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

  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  // NEW: modal вставки лінка для WebView-композера
  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const flatListRef = useRef(null);
  const processedRead = useRef(new Set());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const uid = await AsyncStorage.getItem('userId');
      const gid = await AsyncStorage.getItem('guildId');
      setUserId(uid);
      setGuildId(gid);
    })();
  }, []);

  useEffect(() => {
    if (!chatId || !guildId || !userId) return;

    const chatRef = database().ref(`guilds/${guildId}/chats/${chatId}`);
    const listener = chatRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      setChatType(data.type || 'private');

      if (data.type === 'private') {
        const otherId = Object.keys(data.members || {}).find((id) => id !== userId);
        if (otherId) {
          database()
            .ref(`guilds/${guildId}/guildUsers/${otherId}`)
            .once('value', (s) => {
              const user = s.val();
              if (user) {
                navigation.setOptions({
                  headerTitle: () => (
                    <View style={styles.headerTitleContainer}>
                      {user.imageUrl ? (
                        <Image source={{ uri: user.imageUrl }} style={styles.headerAvatar} />
                      ) : (
                        <View style={[styles.headerAvatar, { backgroundColor: '#555' }]}>
                          <Text style={{ color: '#fff' }}>?</Text>
                        </View>
                      )}
                      <View>
                        <Text style={styles.headerTitleText}>{user.userName}</Text>
                        <Text style={styles.headerSubText}>У мережі</Text>
                      </View>
                    </View>
                  )
                });
              }
            });
        }
      } else {
        navigation.setOptions({
          headerTitle: () => (
            <View style={styles.headerTitleContainer}>
              {data.groupAvatar && <Image source={{ uri: data.groupAvatar }} style={styles.headerAvatar} />}
              <View>
                <Text style={styles.headerTitleText}>{data.name}</Text>
                <Text style={styles.headerSubText}>{Object.keys(data.members || {}).length} учасників</Text>
              </View>
            </View>
          )
        });
      }
    });

    return () => chatRef.off('value', listener);
  }, [chatId, guildId, userId, navigation]);

  useEffect(() => {
    if (!chatId || !guildId) return;

    const msgRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
    const listener = msgRef.on('value', (snap) => {
      const raw = snap.val() || {};
      const list = Object.entries(raw).map(([id, msg]) => ({ id, ...msg }));

      const grouped = list.reduce((acc, msg) => {
        const dateKey = format(new Date(msg.timestamp), 'd MMMM', { locale });
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(msg);
        return acc;
      }, {});

      const sortedGroups = Object.keys(grouped)
        .map((date) => ({
          date,
          messages: grouped[date].sort((a, b) => a.timestamp - b.timestamp)
        }))
        .sort((a, b) => a.messages[0].timestamp - b.messages[0].timestamp);

      setMessages(sortedGroups);
    });

    return () => msgRef.off('value', listener);
  }, [chatId, guildId, locale]);

  const markAsRead = useCallback(
    (msgs) => {
      if (!userId || !guildId || !chatId) return;
      msgs.forEach((msg) => {
        if (msg.senderId === userId || processedRead.current.has(msg.id)) return;
        if (!msg.readBy || !msg.readBy[userId]) {
          database().ref(`guilds/${guildId}/chats/${chatId}/messages/${msg.id}/readBy/${userId}`).set(Date.now());
          processedRead.current.add(msg.id);
        }
      });
    },
    [userId, guildId, chatId]
  );

  const formatReadTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const timeString = format(date, 'HH:mm', { locale });

    if (date.toDateString() === now.toDateString()) {
      return `сьогодні, ${timeString}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `учора, ${timeString}`;
    }
    return `${format(date, 'dd MMM', { locale })}, ${timeString}`;
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

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      const visibleMessages = viewableItems.flatMap((item) => item.item?.messages || []);
      markAsRead(visibleMessages);
    },
    [markAsRead]
  );

  const handleFormatText = (marker) => {
    // Використовується тільки для edit mode (TextInput), як було
    const { start, end } = selection;
    const text = editMessage ? editMessageText : newMessage;
    if (start === end) return;
    const newText = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
    if (editMessage) setEditMessageText(newText);
    else setNewMessage(newText);
  };

  const handleReply = (msg) => {
    setReplyToMessage(msg);
  };

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
      text: newMessage, // сумісний рядок з маркерами
      html: newMessageHtml || null, // заготовка на майбутній рендер rich-html
      timestamp: Date.now(),
      status: 'sent',
      replyTo: replyToMessage?.id || null
    });

    setNewMessage('');
    setNewMessageHtml('');
    setReplyToMessage(null);
    setComposerSelectionActive(false);

    // очистити редактор
    composerRef.current?.clear?.();
  };

  const handlePin = async (forAll) => {
    const msg = messages.flatMap((g) => g.messages).find((m) => m.id === selectedMessageId);
    if (!msg) return;

    const pinnedRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${msg.id}/pinned`);
    if (forAll) {
      const membersSnap = await database().ref(`guilds/${guildId}/chats/${chatId}/members`).once('value');
      const members = membersSnap.val() || {};
      const pinnedFor = {};
      Object.keys(members).forEach((id) => (pinnedFor[id] = true));
      await pinnedRef.set({ isPinned: true, pinnedFor });
    } else {
      await pinnedRef.update({ isPinned: true, [`pinnedFor/${userId}`]: true });
    }
    setPinModalVisible(false);
    setSelectedMessageId(null);
  };

  const handleUnpin = async (forAll) => {
    const msg = messages.flatMap((g) => g.messages).find((m) => m.id === selectedMessageId);
    if (!msg) return;
    const ref = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${msg.id}/pinned`);
    if (forAll) await ref.remove();
    else await ref.child(`pinnedFor/${userId}`).remove();
    setUnpinModalVisible(false);
    setSelectedMessageId(null);
  };

  const pinnedMessages = messages.flatMap((g) => g.messages).filter((m) => m.pinned?.pinnedFor?.[userId]);
  const reversedMessages = [...messages].reverse();

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
            {/* Закрепленные сообщения */}
            {pinnedMessages.length > 0 && (
              <View style={styles.pinnedContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {pinnedMessages.map((msg) => (
                    <TouchableOpacity key={msg.id} style={styles.pinnedItem}>
                      <View style={styles.pinnedBar} />
                      <Text style={styles.pinnedLabel}>Закріплено</Text>
                      <Text style={styles.pinnedText} numberOfLines={1}>
                        {msg.text || 'Медіа'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Список сообщений */}
            <FlatList
              ref={flatListRef}
              data={reversedMessages}
              inverted={true}
              keyExtractor={(item) => item.date}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View>
                  <View style={styles.dateBadgeContainer}>
                    <Text style={styles.dateBadge}>{item.date}</Text>
                  </View>
                  {item.messages
                    .filter((m) => !m.deletedFor?.[userId])
                    .map((msg, idx) => {
                      const isMe = msg.senderId === userId;
                      const showAvatar =
                        chatType === 'group' && !isMe && (idx === 0 || item.messages[idx - 1].senderId !== msg.senderId);

                      // Додаткові лінки з msg.html (для випадку "anchor text" без URL у msg.text)
                      const textParts = splitMessageIntoParts(msg.text || '');
                      const urlsInText = textParts.filter((p) => p.type === 'link').map((p) => p.value);
                      const urlsInHtml = extractUrlsFromHtml(msg.html || '');
                      const extraUrls = urlsInHtml.filter((u) => !urlsInText.includes(u));

                      return (
                        <View key={msg.id} style={[styles.messageRow, isMe ? styles.rowRight : styles.rowLeft]}>
                          {!isMe && showAvatar && <InterlocutorAvatar senderId={msg.senderId} guildId={guildId} />}
                          {!isMe && !showAvatar && chatType === 'group' && <View style={{ width: 40 }} />}
                          <Menu>
                            <MenuTrigger>
                              <TouchableOpacity
                                activeOpacity={0.9}
                                onLongPress={() => setSelectedMessageId(msg.id)}
                                style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
                              >
                                {chatType === 'group' && !isMe && <SenderName senderId={msg.senderId} currentUserId={userId} guildId={guildId} />}

                                {msg.replyTo && <QuotedMessage replyTo={msg.replyTo} guildId={guildId} chatId={chatId} minimal />}

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

                                {/* Рендер тексту + URL превʼю як було */}
                                {textParts.map((part, i) =>
                                  part.type === 'link' ? <LinkPreviewCard key={i} url={part.value} /> : <FormattedText key={i} text={part.value} />
                                )}

                                {/* Додаткові превʼю-лінки з html */}
                                {extraUrls.map((u) => (
                                  <LinkPreviewCard key={`h_${msg.id}_${u}`} url={u} />
                                ))}

                                <View style={styles.metaContainer}>
                                  {msg.pinned?.isPinned && <FontAwesomeIcon icon={faThumbtack} size={10} color="#888" style={{ marginRight: 4 }} />}
                                  {msg.edited && <Text style={styles.editedLabel}>ред.</Text>}
                                  <Text style={styles.timestamp}>{format(new Date(msg.timestamp), 'HH:mm')}</Text>
                                  {isMe && (
                                    <FontAwesomeIcon
                                      icon={msg.readBy && Object.keys(msg.readBy).some((id) => id !== userId) ? faCheckDouble : faCheck}
                                      size={11}
                                      color="#4cd137"
                                      style={{ marginLeft: 4 }}
                                    />
                                  )}
                                </View>
                              </TouchableOpacity>
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
                                      // щоб не було "паралельного" введення в WebView
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
                                  setMessageToPin(msg);
                                  msg.pinned?.isPinned ? setUnpinModalVisible(true) : setPinModalVisible(true);
                                }}
                                style={styles.menuItem}
                              >
                                <FontAwesomeIcon icon={faThumbtack} color="#ddd" />
                                <Text style={styles.menuText}>{msg.pinned?.isPinned ? 'Відкріпити' : 'Закріпити'}</Text>
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
                    })}
                </View>
              )}
              onViewableItemsChanged={handleViewableItemsChanged}
              contentContainerStyle={{ paddingVertical: 10 }}
            />

            {/* Панель ответа */}
            {replyToMessage && (
              <View style={styles.replyBar}>
                <View style={styles.replyBarLine} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyBarTitle}>Відповідь:</Text>
                  <Text style={styles.replyBarText} numberOfLines={1}>
                    {replyToMessage.text || 'Медіа'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyToMessage(null)}>
                  <FontAwesomeIcon icon={faXmark} color="#aaa" />
                </TouchableOpacity>
              </View>
            )}

            {/* Зона ввода */}
            <View style={styles.inputArea}>
              {/* EDIT MODE: старі інструменти форматування по селекшну (як було) */}
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

              {/* NEW MESSAGE: панель форматування під WebView (показуємо як і раніше тільки коли є селекшн) */}
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

              <View style={styles.inputContainer}>
                <TouchableOpacity style={styles.attachBtn} onPress={pickImage}>
                  <FontAwesomeIcon icon={faPaperclip} size={22} color="#888" />
                </TouchableOpacity>

                {/* EDIT MODE: старий TextInput */}
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
                  // NEW MESSAGE: WebView rich input (живе форматування)
                  <View style={{ flex: 1 }}>
                    <RichTextWebInput
                      ref={composerRef}
                      placeholder="Повідомлення..."
                      minHeight={MIN_INPUT_HEIGHT}
                      maxHeight={MAX_INPUT_HEIGHT}
                      onChange={({ html, marked, selectionActive }) => {
                        setNewMessage(marked);
                        setNewMessageHtml(html);
                        setComposerSelectionActive(!!selectionActive);
                      }}
                    />
                  </View>
                )}

                <TouchableOpacity style={[styles.sendBtn, (newMessage.trim() || editMessage) && styles.sendBtnActive]} onPress={handleSend}>
                  <FontAwesomeIcon icon={editMessage ? faCheck : faPaperPlane} size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Нижний отступ для iPhone X+ (SafeAreaBottom) */}
            <View style={{ height: insets.bottom, backgroundColor: '#1c1c1e' }} />
          </View>
        </KeyboardAvoidingView>

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

        {/* NEW: modal вставки лінка */}
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
              <TouchableOpacity style={styles.actionBtn} onPress={() => handlePin(false)}>
                <Text style={{ color: '#fff' }}>Тільки для мене</Text>
              </TouchableOpacity>
              {chatType === 'group' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handlePin(true)}>
                  <Text style={{ color: '#fff' }}>Для всіх</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={() => setPinModalVisible(false)}>
                <Text style={{ color: '#aaa' }}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={unpinModalVisible} transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.glassCard}>
              <Text style={styles.modalTitle}>Відкріпити повідомлення?</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleUnpin(false)}>
                <Text style={{ color: '#fff' }}>Тільки в мене</Text>
              </TouchableOpacity>
              {chatType === 'group' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleUnpin(true)}>
                  <Text style={{ color: '#ff5b5b' }}>Для всіх</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={() => setUnpinModalVisible(false)}>
                <Text style={{ color: '#aaa' }}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <ImageViewerModal visible={fullSizeImageModalVisible} uri={fullSizeImageUri} onClose={() => setFullSizeImageModalVisible(false)} />

        <DatePicker
          modal
          open={isDatePickerVisible}
          date={new Date()}
          mode="datetime"
          onConfirm={(date) => {
            setIsDatePickerVisible(false);
          }}
          onCancel={() => setIsDatePickerVisible(false)}
          theme="dark"
        />
      </SafeAreaView>
    </MenuProvider>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  pinnedContainer: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderBottomWidth: 1, borderColor: '#333' },
  pinnedItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  pinnedBar: { width: 4, height: 30, backgroundColor: '#121212', borderRadius: 2, marginRight: 10 },
  pinnedLabel: { color: '#121212', fontSize: 11, fontWeight: 'bold' },
  pinnedText: { color: '#ccc', fontSize: 13 },
  dateBadgeContainer: { alignItems: 'center', marginVertical: 15 },
  dateBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, color: '#aaa', fontSize: 12 },
  messageRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 4 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: screenWidth * 0.75, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, marginBottom: 2 },
  bubbleMe: { backgroundColor: 'rgba(52, 152, 219, 0.25)', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(52, 152, 219, 0.3)' },
  bubbleThem: { backgroundColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
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
  mediaIconBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 },
  quotedContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 6 },
  quotedMinimal: { padding: 4 },
  quotedLine: { width: 3, backgroundColor: '#3498db', borderRadius: 2, marginRight: 8 },
  quotedTitle: { color: '#3498db', fontSize: 11, fontWeight: '700' },
  quotedText: { color: '#ccc', fontSize: 13 },
  quotedBody: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  quotedImageThumb: { width: 24, height: 24, borderRadius: 4, marginRight: 6 },
  interlocutorAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  inputArea: { padding: 10, backgroundColor: '#1c1c1e', borderTopWidth: 1, borderColor: '#333' },
  replyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', padding: 10, borderBottomWidth: 1, borderColor: '#333' },
  replyBarLine: { width: 4, height: '100%', backgroundColor: '#3498db', borderRadius: 2, marginRight: 10 },
  replyBarTitle: { color: '#3498db', fontWeight: 'bold', fontSize: 12 },
  replyBarText: { color: '#aaa', fontSize: 13, flex: 1 },
  formatTools: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#2c2c2e', padding: 8, borderRadius: 12, marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2c2c2e', borderRadius: 25, paddingHorizontal: 12, paddingVertical: 4 },
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
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendBtnActive: { backgroundColor: '#3498db' },
  readReceiptOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  readUserRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  readUserName: { color: '#fff', fontSize: 13, marginRight: 6 },
  readUserAvatar: { width: 20, height: 20, borderRadius: 10 },
  extraCount: { color: '#aaa', marginLeft: 4 },
  popupOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', paddingHorizontal: 40 },
  readUsersPopup: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#444', width: 220, maxHeight: 220 },
  readUsersPopupPersonal: { alignSelf: 'flex-end' },
  readUsersPopupInterlocutor: { alignSelf: 'flex-start' },
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
  uploadThumb: { width: 70, height: 70, borderRadius: 10, marginRight: 10 },
  spoilerWrapper: { justifyContent: 'center' },
  spoilerContainer: { backgroundColor: '#333', borderRadius: 4, paddingHorizontal: 4, justifyContent: 'center' },
  spoilerHidden: { backgroundColor: '#444', minWidth: 40, alignItems: 'center' },
  spoilerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerTitleText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSubText: { color: '#aaa', fontSize: 12 },
  imageViewerContainer: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  imageViewerBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
  imageScrollView: { flexGrow: 1, justifyContent: 'center' },
  fullScreenImage: { width: screenWidth, height: screenHeight * 0.8 }
});

export default ChatWindow;
