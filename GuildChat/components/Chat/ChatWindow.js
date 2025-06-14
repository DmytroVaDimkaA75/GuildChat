import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
  Dimensions,
  Modal,
  ScrollView,
  Button,
  Alert,
  ActivityIndicator,
  Clipboard,
  Linking
} from "react-native";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  get,
  update
} from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faPaperclip,
  faPaperPlane,
  faClock,
  faCheck,
  faCheckDouble,
  faReply
} from '@fortawesome/free-solid-svg-icons';
import { faYoutube } from '@fortawesome/free-brands-svg-icons';
import { faFileAlt, faTableCellsLarge, faChartSimple } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { uk, ru, es, fr, de } from 'date-fns/locale';
import { Menu, MenuTrigger, MenuOptions, MenuOption } from 'react-native-popup-menu';
import translateMessage from '../../translateMessage';
import { database, storage } from '../../firebaseConfig';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";
import * as ImagePicker from 'expo-image-picker';
import uuid from 'react-native-uuid';
import Markdown from 'react-native-markdown-display';

// Імпорт кастомного чекбоксу
import CustomCheckBox from '../CustomElements/CustomCheckBox3';
// Імпорт SVG-іконок через react-native-svg-transformer
import PinIcon from '../ico/pin.svg';
import UnpinIcon from '../ico/unpin.svg';
import PinsIcon from '../ico/pins.svg';
import TransleteIcon from '../ico/translete.svg';
import ReplyIcon from '../ico/reply.svg';
import CopyIcon from '../ico/copy.svg';
import PencilIcon from '../ico/pencil.svg';
import DeleteIcon from '../ico/delete.svg';
import CalendarclockIcon from '../ico/calendarclock.svg';
import ClockIcon from '../ico/clock.svg';
import UsercheckIcon from '../ico/usercheck.svg';
import FontIcon from '../ico/font.svg';

// =======================
// Компонент SendOptionsPopup (попап, а не модальне вікно)
// =======================
const SendOptionsPopup = ({ visible, chatType, onClose, onSendLater, onSendToSelected, onFormatText }) => {
  if (!visible) return null;
  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.popupOverlay}
      onPress={onClose}
    >
      <View style={styles.sendOptionsPopup}>
        <TouchableOpacity
          style={styles.sendOptionButton}
          onPress={() => {
            onSendLater();
            onClose();
          }}
        >
          <View style={styles.sendOptionContent}>
            <CalendarclockIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
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
            <ClockIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
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
              <UsercheckIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
              <Text style={styles.sendOptionText}>Надіслати обраним</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.sendOptionButton}
          onPress={() => {
            onFormatText();
            onClose();
          }}
        >
          <View style={styles.sendOptionContent}>
            <FontIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
            <Text style={styles.sendOptionText}>Стилізація тексту</Text>
          </View>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const { width: screenWidth } = Dimensions.get('window');
const locales = { uk, ru, es, fr, de };

const isYouTubeURL = (url) => url.includes('youtube.com') || url.includes('youtu.be');
const isDocsURL = (url) => url.includes('docs.google.com');

const getDocsIcon = (url) => {
  if (url.includes("/document/")) return faFileAlt;
  if (url.includes("/spreadsheets/")) return faTableCellsLarge;
  if (url.includes("/presentation/")) return faChartSimple;
  return null;
};

function hasLinkOrImage(message) {
  const hasImage = message.imageUrls && message.imageUrls.length > 0;
  const urlRegex = /https?:\/\/[^\s]+/g;
  const hasLink = message.text ? urlRegex.test(message.text) : false;
  return hasImage || hasLink;
}

const splitMessageIntoParts = (text) => {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];
  const textParts = text.split(urlRegex);
  const result = [];
  for (let i = 0; i < textParts.length; i++) {
    if (textParts[i]) result.push({ type: 'text', value: textParts[i] });
    if (i < urls.length) result.push({ type: 'link', value: urls[i] });
  }
  return result;
};

const LinkPreviewCard = ({ url }) => {
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const response = await fetch(url);
        const html = await response.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i);
        const descMatch = html.match(/<meta property=["']og:description["'] content=["'](.*?)["']/i);
        const imageMatch = html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i);
        const title = ogTitleMatch ? ogTitleMatch[1] : titleMatch ? titleMatch[1] : url;
        let description = descMatch ? descMatch[1] : "";
        const image = imageMatch ? imageMatch[1] : null;
        if (isYouTubeURL(url)) description = "";
        setPreviewData({ title, description, image });
      } catch (error) {
        console.error("Error fetching link preview:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [url]);
  if (loading) {
    return (
      <View style={styles.linkPreviewContainer}>
        <ActivityIndicator size="small" color="#888" />
      </View>
    );
  }
  if (!previewData) return null;
  return (
    <TouchableOpacity style={styles.linkPreviewContainer} onPress={() => Linking.openURL(url)}>
      {previewData.image && (
        <Image source={{ uri: previewData.image }} style={styles.linkPreviewImage} resizeMode="contain" />
      )}
      <View style={styles.linkPreviewTextContainer}>
        <Text style={styles.linkPreviewTitle} numberOfLines={2}>{previewData.title}</Text>
        {previewData.description ? (
          <Text style={styles.linkPreviewDescription} numberOfLines={3}>{previewData.description}</Text>
        ) : null}
      </View>
      {isYouTubeURL(url) && (
        <View style={styles.youtubeIconContainer}>
          <FontAwesomeIcon icon={faYoutube} size={20} color="#FF0000" />
        </View>
      )}
      {isDocsURL(url) && (
        <View style={styles.docsIconContainer}>
          <FontAwesomeIcon icon={getDocsIcon(url)} size={20} color="#4285F4" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const PinnedPreview = ({ url, previewData }) => {
  if (isYouTubeURL(url)) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <FontAwesomeIcon icon={faYoutube} size={24} color="#FF0000" />
      </View>
    );
  }
  if (isDocsURL(url)) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <FontAwesomeIcon icon={getDocsIcon(url)} size={24} color="#4285F4" />
      </View>
    );
  }
  if (previewData) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {previewData.image && (
          <Image source={{ uri: previewData.image }} style={styles.pinnedImage} resizeMode="cover" />
        )}
      </View>
    );
  }
  const [fetchedPreview, setFetchedPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(url);
        const html = await response.text();
        const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i);
        const titleTagMatch = html.match(/<title>(.*?)<\/title>/i);
        const metaTitleMatch = html.match(/<meta name=["']title["'] content=["'](.*?)["']/i);
        const imageMatch = html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i);
        const title = (ogTitleMatch && ogTitleMatch[1].trim()) ||
                      (titleTagMatch && titleTagMatch[1].trim()) ||
                      (metaTitleMatch && metaTitleMatch[1].trim()) ||
                      url;
        const previewImage = imageMatch ? imageMatch[1] : null;
        setFetchedPreview({ title, image: previewImage });
      } catch (error) {
        console.error("Error in PinnedPreview:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [url]);
  if (loading) {
    return <ActivityIndicator size="small" color="#888" />;
  }
  if (!fetchedPreview) {
    return <Text>{url}</Text>;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {fetchedPreview.image && (
        <Image source={{ uri: fetchedPreview.image }} style={styles.pinnedImage} resizeMode="cover" />
      )}
      <Text style={{ marginLeft: 5, flex: 1 }} numberOfLines={2}>
        {fetchedPreview.title}
      </Text>
    </View>
  );
};

const SingleImage = ({ uri }) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  useEffect(() => {
    Image.getSize(
      uri,
      (width, height) => setAspectRatio(width / height),
      (error) => console.error("Error getting image size", error)
    );
  }, [uri]);
  return (
    <TouchableOpacity onPress={() => { /* можна додати повноекранний перегляд */ }}>
      <Image source={{ uri }} style={[styles.singleImage, { aspectRatio }]} resizeMode="contain" />
    </TouchableOpacity>
  );
};

const getPinnedMessageText = (messageId, allMessages) => {
  const found = allMessages.flatMap(group => group.messages).find(m => m.id === messageId);
  return found ? found.text : "(Повідомлення не знайдено)";
};

const handleAttachMessage = async (message, userId, guildId, chatId, pinForAllOrUser) => {
  try {
    const db = getDatabase();
    const messageRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages/${message.id}/pinned`);
    let pinnedFor = {};
    pinnedFor[userId] = true;
    if (pinForAllOrUser) {
      const chatMembersRef = ref(db, `guilds/${guildId}/chats/${chatId}/members`);
      const snapshot = await get(chatMembersRef);
      if (snapshot.exists()) {
        const members = snapshot.val();
        Object.keys(members).forEach((memberId) => {
          pinnedFor[memberId] = true;
        });
      }
    }
    await update(messageRef, {
      isPinned: true,
      pinnedFor: pinnedFor
    });
  } catch (error) {
    console.error("Error pinning message:", error);
  }
};

const handleUnpinMessage = async (message, userId, guildId, chatId, forAll) => {
  try {
    const db = getDatabase();
    const pinnedRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages/${message.id}/pinned`);
    if (forAll) {
      // Видалити pinned повністю
      await set(pinnedRef, null);
    } else {
      // Видалити лише pinnedFor[userId]
      const pinnedForRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages/${message.id}/pinned/pinnedFor/${userId}`);
      await set(pinnedForRef, null);
    }
  } catch (error) {
    console.error("Error unpinning message:", error);
  }
};

const SenderName = ({ senderId, currentUserId }) => {
  const [userName, setUserName] = useState(null);
  useEffect(() => {
    if (senderId !== currentUserId) {
      const db = getDatabase();
      const userRef = ref(db, `users/${senderId}/userName`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        const name = snapshot.val();
        if (name) {
          setUserName(name);
        }
      });
      return () => unsubscribe();
    }
  }, [senderId, currentUserId]);
  return userName ? <Text style={styles.senderId}>{userName}</Text> : null;
};

const InterlocutorAvatar = ({ senderId, guildId }) => {
  const [avatar, setAvatar] = useState(null);
  useEffect(() => {
    if (senderId && guildId) {
      const db = getDatabase();
      const userRef = ref(db, `guilds/${guildId}/guildUsers/${senderId}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data && data.imageUrl) {
            setAvatar(data.imageUrl);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [senderId, guildId]);
  if (!avatar) return null;
  return <Image source={{ uri: avatar }} style={styles.interlocutorAvatar} />;
};

const renderQuotedContent = (quotedMessage) => {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const hasImages = quotedMessage.imageUrls && quotedMessage.imageUrls.length > 0;
  const hasLink = quotedMessage.text ? urlRegex.test(quotedMessage.text) : false;
  const hasText = quotedMessage.text && quotedMessage.text.trim().length > 0;

  let visualElement = null;
  let textContent = null;

  if (hasLink) {
    const urls = quotedMessage.text.match(urlRegex) || [];
    const firstUrl = urls[0];
    if (quotedMessage.previewData) {
      visualElement = <PinnedPreview previewData={quotedMessage.previewData} url={firstUrl} />;
      const extraText = quotedMessage.text.replace(urlRegex, "").trim();
      textContent = extraText || (quotedMessage.previewData.title || firstUrl);
    } else if (isYouTubeURL(firstUrl) || isDocsURL(firstUrl)) {
      if (isYouTubeURL(firstUrl)) {
        visualElement = (
          <FontAwesomeIcon icon={faYoutube} size={24} color="#FF0000" />
        );
        // Виводимо заголовок ролику, якщо є previewData.title, інакше адресу
        const title =
          quotedMessage.previewData && quotedMessage.previewData.title
            ? quotedMessage.previewData.title
            : firstUrl;
        const extraText = quotedMessage.text.replace(urlRegex, "").trim();
        textContent = extraText || title;
      } else {
        visualElement = (
          <FontAwesomeIcon icon={getDocsIcon(firstUrl)} size={24} color="#4285F4" />
        );
        const extraText = quotedMessage.text.replace(urlRegex, "").trim();
        textContent = extraText || (quotedMessage.title || firstUrl);
      }
    } else if (quotedMessage.previewImage) {
      visualElement = (
        <Image source={{ uri: quotedMessage.previewImage }} style={styles.pinnedImage} resizeMode="cover" />
      );
      const extraText = quotedMessage.text.replace(urlRegex, "").trim();
      textContent = extraText || (quotedMessage.title || firstUrl);
    } else {
      visualElement = <PinnedPreview url={firstUrl} />;
      const extraText = quotedMessage.text.replace(urlRegex, "").trim();
      textContent = extraText || (quotedMessage.title || firstUrl);
    }
  } else if (hasImages) {
    visualElement = (
      <Image source={{ uri: quotedMessage.imageUrls[0] }} style={styles.pinnedImage} resizeMode="cover" />
    );
    textContent = hasText ? quotedMessage.text : "Фото";
  } else if (hasText) {
    textContent = quotedMessage.text;
  }

  const textColumn = (
    <View style={styles.pinnedTextColumn}>
      <Text style={styles.pinnedHeader}>Цитоване повідомлення</Text>
      {textContent ? <Text numberOfLines={1} style={styles.pinnedText}>{textContent}</Text> : null}
    </View>
  );

  return (
    <View style={styles.quotedContentRow}>
      {visualElement && (
        <View style={styles.visualElementContainer}>
          {visualElement}
        </View>
      )}
      {textColumn}
    </View>
  );
};

const QuotedMessage = ({ replyTo, guildId, chatId }) => {
  const [quotedMsg, setQuotedMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getDatabase();
    const msgRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages/${replyTo}`);
    get(msgRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          setQuotedMsg(snapshot.val());
        }
      })
      .catch((error) => console.error("Error fetching quoted message: ", error))
      .finally(() => setLoading(false));
  }, [replyTo, guildId, chatId]);

  if (loading) return <ActivityIndicator size="small" color="#888" />;
  if (!quotedMsg) return <Text style={{ fontStyle: 'italic', color: '#888' }}>Повідомлення не знайдено</Text>;
  return renderQuotedContent(quotedMsg);
};

const commonModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: '80%',
    alignItems: 'center',
    elevation: 2,
  },
  header: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  button: {
    marginHorizontal: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'stretch',
  },
  buttonText: {
    fontSize: 16,
    color: '#007aff',
    textAlign: 'center',
  },
});

const buttonContainerRow = {
  flexDirection: 'row',
  alignSelf: 'stretch',
  justifyContent: 'flex-end',
};

const buttonContainerColumn = {
  flexDirection: 'column',
  alignSelf: 'stretch',
  justifyContent: 'center',
};

// Функції для модального вікна стилізації
const renderFormatButton = (label, marker, wrapSelection) => (
  <TouchableOpacity style={styles.formatButton} onPress={() => wrapSelection(marker)}>
    <Text style={styles.formatButtonText}>{label}</Text>
  </TouchableOpacity>
);

// Функція, яка використовує виділення для форматування окремого фрагмента
// Додано використання selection state
// Якщо нічого не виділено, функція нічого не робить
const defaultWrapSelection = (marker, text, selection, setText, setSelection) => {
  const { start, end } = selection;
  if (start === end) return; // якщо нічого не виділено, не змінюємо текст
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const formatted = `${marker}${selected}${marker}`;
  const newText = before + formatted + after;
  setText(newText);
  const newCursorPos = start + formatted.length;
  setSelection({ start: newCursorPos, end: newCursorPos });
};

const ChatWindow = ({ route, navigation }) => {
  const { chatId } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  // Додаємо state для збереження позиції виділення тексту
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [inputHeight, setInputHeight] = useState(40);
  const maxInputHeight = 120;
  const [userId, setUserId] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [contactAvatar, setContactAvatar] = useState(null);
  const [contactName, setContactName] = useState(null);
  const [chatType, setChatType] = useState(null);
  const [locale, setLocale] = useState(uk);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const firebaseStorage = getStorage();
  const [selectedImageUris, setSelectedImageUris] = useState([]);
  const [imageCaption, setImageCaption] = useState("");
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [fullSizeImageUri, setFullSizeImageUri] = useState(null);
  const [fullSizeImageModalVisible, setFullSizeImageModalVisible] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [replyToMessageText, setReplyToMessageText] = useState('');
  // Новий state для попапу опцій надсилання
  const [sendOptionsPopupVisible, setSendOptionsPopupVisible] = useState(false);
  // Новий state для модального вікна стилізації
  const [isFormattingModalVisible, setFormattingModalVisible] = useState(false);
  const processedMessages = useRef(new Set());

  const [unpinModalVisible, setUnpinModalVisible] = useState(false);
  const [messageToUnpin, setMessageToUnpin] = useState(null);


  const handleReply = (message) => {
    setReplyToMessage(message);
    setReplyToMessageText(message.text);
  };

// Show a double-check icon when a message was seen by someone other than
// the sender or when its status explicitly equals "read".
const getStatusIcon = (message) => {
    if (!message) return null;
    const { status, readBy, senderId } = message;
    const isReadByOthers = readBy && Object.keys(readBy).some(id => id !== senderId);
    if (isReadByOthers || status === 'read') {
      return (
        <View style={styles.doubleCheckContainer}>
          <FontAwesomeIcon icon={faCheck} size={14} style={styles.statusIcon} />
          <FontAwesomeIcon icon={faCheckDouble} size={14} style={[styles.statusIcon, styles.secondCheck]} />
        </View>
      );
    }
    switch (status) {
      case 'sending':
        return <FontAwesomeIcon icon={faClock} size={14} style={styles.statusIcon} />;
      case 'sent':
      default:
        return <FontAwesomeIcon icon={faCheck} size={14} style={styles.statusIcon} />;
    }
  };

// Format a timestamp relative to today/yesterday to display read time.
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

// Component that renders read receipt info and list for group chats
const GroupReadReceiptOption = ({ message, isCurrentUser }) => {
    const [usersInfo, setUsersInfo] = useState({});
    const [showList, setShowList] = useState(false);

    useEffect(() => {
      if (!message || !message.readBy || chatType !== 'group') return;
      const db = getDatabase();
      const entries = Object.keys(message.readBy).filter(id => id !== message.senderId);
      entries.forEach(uid => {
        const uRef = ref(db, `guilds/${guildId}/guildUsers/${uid}`);
        get(uRef).then(snap => {
          if (snap.exists()) {
            const data = snap.val();
            setUsersInfo(prev => ({ ...prev, [uid]: { userName: data.userName, imageUrl: data.imageUrl } }));
          }
        });
      });
    }, [message]);

    if (!message || chatType !== 'group') return null;
    const readers = Object.entries(message.readBy || {}).filter(([id]) => id !== message.senderId);
    if (readers.length === 0) return null;
    readers.sort((a,b) => a[1]-b[1]);
    const firstId = readers[0][0];
    const firstInfo = usersInfo[firstId] || {};
    const moreCount = readers.length - 1;
    const displayName = firstInfo.userName ? (firstInfo.userName.length > 15 ? `${firstInfo.userName.slice(0,15)}…` : firstInfo.userName) : '…';

    return (
      <>
        <TouchableOpacity onPress={() => setShowList(!showList)} style={styles.readReceiptOption}>
          <FontAwesomeIcon icon={faCheckDouble} size={16} color="#4CAF50" style={{ marginRight: 5 }} />
          <Text style={{ flexShrink: 1 }} numberOfLines={1}>
            {displayName}{moreCount > 0 && <Text style={{ color: 'red' }}>{` (+${moreCount})`}</Text>}
          </Text>
          {firstInfo.imageUrl && (
            <Image source={{ uri: firstInfo.imageUrl }} style={styles.readReceiptAvatar} />
          )}
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
        {showList && (
          <View style={[styles.readByPopup, isCurrentUser ? styles.readByPopupLeft : styles.readByPopupRight]}>
            <ScrollView>
              {readers.map(([uid]) => {
                const info = usersInfo[uid] || {};
                const name = info.userName ? (info.userName.length > 20 ? `${info.userName.slice(0,20)}…` : info.userName) : '…';
                return (
                  <View key={uid} style={styles.readByItem}>
                    <Text style={styles.readByName}>{name}</Text>
                    {info.imageUrl && <Image source={{ uri: info.imageUrl }} style={styles.readReceiptAvatar} />}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </>
    );
  };

// When a private message has been read, show the time at the top of the menu.
const renderReadReceiptOption = (message, isCurrentUser) => {
    if (!message) return null;
    if (chatType === 'private') {
      const { readBy, senderId } = message;
      if (!readBy) return null;
      const otherEntries = Object.entries(readBy).filter(([id]) => id !== senderId);
      if (otherEntries.length === 0) return null;
      const readTime = otherEntries[0][1];
      return (
        <>
          <View style={styles.readReceiptOption}>
            <FontAwesomeIcon icon={faCheckDouble} size={16} color="#4CAF50" style={{ marginRight: 5 }} />
            <Text>{formatReadTime(readTime)}</Text>
          </View>
          <View style={styles.menuSeparator} />
        </>
      );
    }
    if (chatType === 'group') {
      return <GroupReadReceiptOption message={message} isCurrentUser={isCurrentUser} />;
    }
    return null;
  };

  const flatListRef = useRef(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [messageHeights, setMessageHeights] = useState({});
  const messageRefs = useRef({});
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [originalFirstUnreadId, setOriginalFirstUnreadId] = useState(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  const [pinMessageModalVisible, setPinMessageModalVisible] = useState(false);
  const [pinForAllOrUser, setPinForAllOrUser] = useState(false);

  useEffect(() => {
    if (pinMessageModalVisible) {
      setPinForAllOrUser(false);
    }
  }, [pinMessageModalVisible]);

  useEffect(() => {
    setInitialScrollDone(false);
    setFirstUnreadId(null);
    setOriginalFirstUnreadId(null);
    processedMessages.current = new Set();
  }, [chatId]);

  const handleContentSizeChange = (event) => {
    const { height } = event.nativeEvent.contentSize;
    const newHeight = Math.min(Math.max(40, height), maxInputHeight);
    setInputHeight(newHeight);
  };

  const checkAndMarkRead = useCallback((messagesToCheck) => {
    if (!userId || !guildId || !chatId) return;

    const db = getDatabase();
    const currentTime = Date.now();
    const windowHeight = Dimensions.get('window').height;

    messagesToCheck.forEach(message => {
      if (!message) return;
      const { id, senderId, readBy } = message;
      const isUnread = !readBy || !readBy[userId];

      if (senderId === userId || !isUnread || processedMessages.current.has(id)) {
        return;
      }

      const msgRef = messageRefs.current[id];
      if (!msgRef || typeof msgRef.measureInWindow !== 'function') return;

      msgRef.measureInWindow((x, y, width, height) => {
        if (y >= 0 && y + height <= windowHeight) {
          const path = `guilds/${guildId}/chats/${chatId}/messages/${id}/readBy/${userId}`;
          set(ref(db, path), currentTime)
            .catch(error => {
              console.error('Firebase update error:', error);
              Alert.alert('Помилка', 'Не вдалося оновити статус переглядів');
            });
          processedMessages.current.add(id);
        }
      });
    });
  }, [userId, guildId, chatId]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    const messagesToCheck = [];

    viewableItems.forEach(item => {
      if (!item || !item.item || !Array.isArray(item.item.messages)) return;
      messagesToCheck.push(...item.item.messages);
    });

    checkAndMarkRead(messagesToCheck);
  }, [checkAndMarkRead]);

  const handleScroll = useCallback(() => {
    const unread = messages
      .flatMap(g => g.messages)
      .filter(m => m.senderId !== userId && (!m.readBy || !m.readBy[userId]) && !processedMessages.current.has(m.id));
    checkAndMarkRead(unread);
  }, [messages, userId, checkAndMarkRead]);

  const pinnedMessagesForUser = messages
    .flatMap(group => group.messages)
    .filter(m => m.pinned && m.pinned.pinnedFor && m.pinned.pinnedFor[userId]);

  const hasSetOriginalUnreadId = useRef(false);

  useEffect(() => {
    const fetchUserIdAndGuildId = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        const storedGuildId = await AsyncStorage.getItem("guildId");
        setUserId(storedUserId);
        setGuildId(storedGuildId);
      } catch (error) {
        console.error("Error fetching user or guild ID: ", error);
      }
    };
    fetchUserIdAndGuildId();
  }, []);

  useEffect(() => {
    if (userId) {
      const db = getDatabase();
      const localeRef = ref(db, `users/${userId}/setting/language`);
      onValue(localeRef, (snapshot) => {
        const localeCode = snapshot.val();
        setLocale(locales[localeCode] || uk);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (chatId && guildId) {
      const db = getDatabase();
      const chatRef = ref(db, `guilds/${guildId}/chats/${chatId}`);
      onValue(chatRef, (snapshot) => {
        const chatData = snapshot.val();
        if (!chatData) return;
        setChatType(chatData.type || 'private');
        if (chatData.type === 'group') {
          navigation.setOptions({
            headerTitle: () => (
              <View style={styles.headerContent}>
                {chatData.groupAvatar ? (
                  <Image source={{ uri: chatData.groupAvatar }} style={styles.groupAvatar} />
                ) : null}
                <Text style={styles.headerTitle}>{chatData.name}</Text>
              </View>
            )
          });
        } else if (chatData.type === 'private') {
          const chatMembersRef = ref(db, `guilds/${guildId}/chats/${chatId}/members`);
          onValue(chatMembersRef, (snap) => {
            const members = snap.val() || {};
            const otherUserId = Object.keys(members).find(id => id !== userId);
            if (otherUserId) {
              const userRef = ref(db, `guilds/${guildId}/guildUsers/${otherUserId}`);
              onValue(userRef, (userSnap) => {
                const userData = userSnap.val();
                if (userData) {
                  setContactAvatar(userData.imageUrl);
                  setContactName(userData.userName);
                  navigation.setOptions({
                    headerTitle: () => (
                      <View style={styles.headerContent}>
                        {contactAvatar && (
                          <Image source={{ uri: contactAvatar }} style={styles.avatar} />
                        )}
                        <Text style={styles.headerTitle}>{contactName}</Text>
                      </View>
                    ),
                  });
                }
              });
            }
          });
        }
      });
    }
  }, [chatId, guildId, navigation, userId, contactAvatar, contactName]);

  
  useEffect(() => {
    const fetchMessages = () => {
      if (!chatId || !guildId || !userId) return;
      const db = getDatabase();
      const messagesRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages`);
      onValue(messagesRef, (snapshot) => {
        const messagesData = snapshot.val() || {};
        
        const messagesList = Object.keys(messagesData).map(key => ({
          id: key,
          type: 'message',
          ...messagesData[key],
        }));
        
        const unreadMessages = messagesList.filter(msg => 
          msg.senderId !== userId && 
          (!msg.readBy || !msg.readBy[userId])
        );
        
        if (messagesList.length > 0 && !hasSetOriginalUnreadId.current && unreadMessages.length > 0) {
          setOriginalFirstUnreadId(unreadMessages[0].id);
          setFirstUnreadId(unreadMessages[0].id);
          hasSetOriginalUnreadId.current = true;
        }
        
        const groupedMessages = messagesList.reduce((acc, message) => {
          const date = format(new Date(message.timestamp), 'd MMMM', { locale });
          if (!acc[date]) acc[date] = [];
          acc[date].push(message);
          return acc;
        }, {});
        
        const groupedMessagesArray = Object.keys(groupedMessages).map(date => ({
          date,
          messages: groupedMessages[date],
          type: 'date'
        }));
        
        setMessages(groupedMessagesArray);
      });
    };
    fetchMessages();
  }, [chatId, guildId, userId, locale]);

  useEffect(() => {
    if (!userId || messages.length === 0 || hasSetOriginalUnreadId.current) return;
    
    const allMsgs = messages.flatMap(g => g.messages);
    const unreadMsg = allMsgs.find(m => 
      m.senderId !== userId && 
      (!m.readBy || !m.readBy[userId]) && 
      !processedMessages.current.has(m.id)
    );
    
    if (unreadMsg) {
      setFirstUnreadId(unreadMsg.id);
      
      if (!hasSetOriginalUnreadId.current) {
        setOriginalFirstUnreadId(unreadMsg.id);
        hasSetOriginalUnreadId.current = true;
      }
    }
  }, [messages, userId]);

  useEffect(() => {
    if (initialScrollDone) return;
    if (!flatListRef.current) return;
    if (messages.length === 0) return;

    const timer = setTimeout(() => {
      const hasUnreadMessages = messages
        .flatMap(g => g.messages)
        .some(m => m.senderId !== userId && (!m.readBy || !m.readBy[userId]));
      
      if (firstUnreadId) {
        const indices = findGroupAndMessageIndex(firstUnreadId);
        if (indices) {
          try {
            flatListRef.current.scrollToIndex({ index: indices.groupIndex, animated: false });
            setTimeout(() => {
              if (messageHeights[firstUnreadId]) {
                scrollToUnread(firstUnreadId);
              }
            }, 100);
          } catch (e) {
            console.error('Error scrolling to index:', e);
          }
        }
      } else if (!hasUnreadMessages) {
        try {
          flatListRef.current?.scrollToEnd({ animated: false });
        } catch (e) {
          console.error('Error scrolling to end:', e);
        }
      }
      setInitialScrollDone(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [firstUnreadId, messages, initialScrollDone, messageHeights, userId]);

  useEffect(() => {
    if (!flatListRef.current || !initialScrollDone || firstUnreadId) return;
    
    const hasUnreadMessages = messages
      .flatMap(g => g.messages)
      .some(m => m.senderId !== userId && (!m.readBy || !m.readBy[userId]));
    
    if (hasUnreadMessages) return;
    
    const fallbackTimer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 500);

    return () => clearTimeout(fallbackTimer);
  }, [messages, initialScrollDone, firstUnreadId, userId]);

  const selectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Увага", "Доступ до медіа-ресурсів не надано.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: true,
      });
      if (!result.canceled) {
        const uris = result.assets.map(asset => asset.uri);
        setSelectedImageUris(uris);
        setCaptionModalVisible(true);
      }
    } catch (error) {
      Alert.alert("Помилка", `Не вдалося вибрати зображення: ${error.message}`);
    }
  };

  const uploadImageAndSaveMessage = async () => {
    try {
      if (selectedImageUris.length === 0) return;
      const guildIdFromStorage = await AsyncStorage.getItem('guildId');
      const userIdFromStorage = await AsyncStorage.getItem('userId');
      const { chatId } = route.params || {};
      if (!guildIdFromStorage || !chatId) {
        console.error('Не вдалося отримати guildId або chatId.');
        Alert.alert('Помилка', 'Не вдалося отримати guildId або chatId.');
        return;
      }
      const db = getDatabase();
      const messageRef = push(ref(db, `guilds/${guildIdFromStorage}/chats/${chatId}/messages`));
      await set(messageRef, {
        text: imageCaption,
        timestamp: Date.now(),
        senderId: userIdFromStorage,
        status: 'sending',
      });
      const imageUrls = [];
      for (const uri of selectedImageUris) {
        const imageId = uuid.v4();
        const imageRef = storageRef(getStorage(), `images/${imageId}.jpeg`);
        const response = await fetch(uri);
        const blob = await response.blob();
        await uploadBytes(imageRef, blob);
        const imageUrl = await getDownloadURL(imageRef);
        imageUrls.push(imageUrl);
      }
      await set(messageRef, {
        text: imageCaption,
        imageUrls,
        timestamp: Date.now(),
        senderId: userIdFromStorage,
        status: 'sent'
      });
      setSelectedImageUris([]);
      setImageCaption("");
      setCaptionModalVisible(false);
    } catch (error) {
      Alert.alert("Помилка", `Не вдалося завантажити зображення: ${error.message}`);
    }
  };

  const handleSendMessage = async () => {
    if (newMessage.trim() === "") return;
    try {
      const db = getDatabase();
      if (!chatId || !userId || !guildId) throw new Error("Missing IDs");
      const messagesRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages`);
      const newMessageRef = push(messagesRef);
      await set(newMessageRef, {
        senderId: userId,
        text: newMessage,
        timestamp: Date.now(),
        status: 'sending',
        replyTo: replyToMessage ? replyToMessage.id : null,
        replyToText: replyToMessage ? replyToMessage.text : null,
      });
      await set(ref(db, `guilds/${guildId}/chats/${chatId}/messages/${newMessageRef.key}/status`), 'sent');

      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = newMessage.match(urlRegex);
      if (urls && urls.length > 0) {
        const firstUrl = urls[0];
        try {
          const response = await fetch(firstUrl);
          const html = await response.text();
          const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i);
          const titleTagMatch = html.match(/<title>(.*?)<\/title>/i);
          const metaTitleMatch = html.match(/<meta name=["']title["'] content=["'](.*?)["']/i);
          const imageMatch = html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i);
          const title = (ogTitleMatch && ogTitleMatch[1].trim()) ||
                        (titleTagMatch && titleTagMatch[1].trim()) ||
                        (metaTitleMatch && metaTitleMatch[1].trim()) ||
                        firstUrl;
          const image = imageMatch ? imageMatch[1] : null;
          await update(ref(db, `guilds/${guildId}/chats/${chatId}/messages/${newMessageRef.key}`), {
            previewData: { title, image }
          });
        } catch (e) {
          console.error("Error fetching preview for pinned message:", e);
        }
      }

      setNewMessage("");
      setInputHeight(40);
      setReplyToMessage(null);
      setReplyToMessageText('');
    } catch (error) {
      console.error("Error sending message: ", error);
    }
  };

  const handleMenuOptionSelect = async (option) => {
    if (selectedMessageId) {
      const selectedMessage = messages.flatMap(group => group.messages).find(m => m.id === selectedMessageId);
      if (!selectedMessage) return;
      if (option === 'translate') {
        try {
          const translationRef = ref(database, `guilds/${guildId}/chats/${chatId}/messages/${selectedMessageId}/translate/${locale.code}`);
          const snapshot = await get(translationRef);
          if (snapshot.exists()) {
            setTranslatedText(snapshot.val());
            setModalVisible(true);
          } else {
            const translated = await translateMessage(selectedMessage.text, locale.code);
            await set(translationRef, translated);
            setTranslatedText(translated);
            setModalVisible(true);
          }
        } catch (error) {
          console.error("Error translating or saving message:", error);
        }
      }
      setSelectedMessageId(null);
    }
  };

  const handlePressMessage = (messageId) => {
    setSelectedMessageId(messageId);
  };

  const handleDeleteMessage = async (deleteForBoth) => {
    if (!messageToDelete) return;
    try {
      const db = getDatabase();
      const messageRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages/${messageToDelete.id}`);
      if (deleteForBoth) {
        await set(messageRef, null);
      } else {
        const updatedMessage = { ...messageToDelete, deletedFor: { [userId]: true } };
        await set(messageRef, updatedMessage);
      }
      setMessages(prev =>
        prev.map(group => ({
          ...group,
          messages: group.messages.filter(m => m.id !== messageToDelete.id)
        }))
      );
      setDeleteModalVisible(false);
      setMessageToDelete(null);
    } catch (error) {
      console.error("Error deleting message: ", error);
    }
  };

  const handleCopyMessage = (message) => {
    Clipboard.setString(message.text);
  };

  const handleEditMessage = (message) => {
    setEditMessage(message);
    setEditMessageText(message.text);
  };

  const saveEditedMessage = async () => {
    if (!editMessage || editMessageText.trim() === "") return;
    try {
      const db = getDatabase();
      const messageRef = ref(db, `guilds/${guildId}/chats/${chatId}/messages/${editMessage.id}`);
      await set(messageRef, {
        ...editMessage,
        text: editMessageText,
        edited: true,
      });
      setMessages(prev =>
        prev.map(group => ({
          ...group,
          messages: group.messages.map(m =>
            m.id === editMessage.id ? { ...m, text: editMessageText, edited: true } : m
          )
        }))
      );
      setEditMessage(null);
      setEditMessageText('');
    } catch (error) {
      console.error("Error editing message: ", error);
    }
  };

  const scrollToMessage = (messageId) => {
    const allMessages = messages.flatMap(group => group.messages);
    const messageIndex = allMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    let scrollOffset = 0;
    for (let i = 0; i < messageIndex; i++) {
      const prevMessageId = allMessages[i].id;
      const messageHeight = messageHeights[prevMessageId] || 100;
      scrollOffset += messageHeight + 10;
    }
    const dateHeaderHeight = 50;
    const datesBeforeMessage = new Set(
      allMessages.slice(0, messageIndex).map(m => format(new Date(m.timestamp), 'd MMMM'))
    ).size;
    scrollOffset += dateHeaderHeight * datesBeforeMessage;
    const windowHeight = Dimensions.get('window').height;
    const centerOffset = windowHeight / 2 - (messageHeights[messageId] || 100) / 2;
    flatListRef.current?.scrollToOffset({
      offset: Math.max(0, scrollOffset - centerOffset),
      animated: true
    });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1500);
  };

  const findGroupAndMessageIndex = (messageId) => {
    for (let gi = 0; gi < messages.length; gi++) {
      const mi = messages[gi].messages.findIndex(m => m.id === messageId);
      if (mi !== -1) return { groupIndex: gi, messageIndex: mi };
    }
    return null;
  };

  const scrollToUnread = (messageId) => {
    const allMessages = messages.flatMap(group => group.messages);
    const messageIndex = allMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    let scrollOffset = 0;
    for (let i = 0; i < messageIndex; i++) {
      const prevMessageId = allMessages[i].id;
      const messageHeight = messageHeights[prevMessageId] || 100;
      scrollOffset += messageHeight + 10;
    }
    const dateHeaderHeight = 50;
    const datesBeforeMessage = new Set(
      allMessages.slice(0, messageIndex).map(m => format(new Date(m.timestamp), 'd MMMM'))
    ).size;
    scrollOffset += dateHeaderHeight * datesBeforeMessage;
    const newHeaderHeight = 40;
    scrollOffset = Math.max(0, scrollOffset - newHeaderHeight);

    const windowHeight = Dimensions.get('window').height;
    const totalHeight = allMessages.reduce((sum, m) => sum + (messageHeights[m.id] || 100) + 10, 0)
      + dateHeaderHeight * new Set(allMessages.map(m => format(new Date(m.timestamp), 'd MMMM'))).size;

    if (totalHeight - scrollOffset <= windowHeight) {
      flatListRef.current?.scrollToEnd({ animated: false });
    } else {
      flatListRef.current?.scrollToOffset({ offset: scrollOffset, animated: false });
    }
  };

  const renderPinnedContent = (message) => {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const hasImages = message.imageUrls && message.imageUrls.length > 0;
    const hasLink = message.text ? urlRegex.test(message.text) : false;
    const hasText = message.text && message.text.trim().length > 0;

    let visualElement = null;
    let textContent = null;

    if (hasLink) {
      const urls = message.text.match(urlRegex) || [];
      const firstUrl = urls[0];
      if (isYouTubeURL(firstUrl)) {
        visualElement = (
          <FontAwesomeIcon icon={faYoutube} size={24} color="#FF0000" />
        );
        // Виводимо заголовок ролику, якщо є previewData.title, інакше адресу
        const title =
          message.previewData && message.previewData.title
            ? message.previewData.title
            : firstUrl;
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || title;
      } else if (isDocsURL(firstUrl)) {
        visualElement = (
          <FontAwesomeIcon icon={getDocsIcon(firstUrl)} size={24} color="#4285F4" />
        );
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || (message.title || firstUrl);
      } else if (message.previewImage) {
        visualElement = (
          <Image source={{ uri: message.previewImage }} style={styles.pinnedImage} resizeMode="cover" />
        );
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || (message.title || firstUrl);
      } else if (message.previewData && message.previewData.title) {
        visualElement = <PinnedPreview previewData={message.previewData} url={firstUrl} />;
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || message.previewData.title;
      } else {
        visualElement = <PinnedPreview url={firstUrl} />;
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || (message.title || firstUrl);
      }
    } else if (hasImages) {
      visualElement = (
        <Image source={{ uri: message.imageUrls[0] }} style={styles.pinnedImage} resizeMode="cover" />
      );
      textContent = hasText ? message.text : "Фото";
    } else if (hasText) {
      textContent = message.text;
    }

    const textColumn = (
      <View style={styles.pinnedTextColumn}>
        <Text style={styles.pinnedHeader}>Прикріплене повідомлення</Text>
        {textContent ? <Text numberOfLines={1} style={styles.pinnedText}>{textContent}</Text> : null}
      </View>
    );

    return (
      <View style={styles.pinnedContentRow}>
        {visualElement && (
          <View style={styles.visualElementContainer}>
            {visualElement}
          </View>
        )}
        {textColumn}
      </View>
    );
  };

  // Нова функція для форматування виділеного фрагмента тексту
  const wrapSelection = (marker) => {
    // Якщо редагуємо, нічого не робимо
    if (editMessage) return;
    const { start, end } = selection;
    if (start === end) return;
    const before = newMessage.slice(0, start);
    const selected = newMessage.slice(start, end);
    const after = newMessage.slice(end);
    const formatted = `${marker}${selected}${marker}`;
    const newText = before + formatted + after;
    setNewMessage(newText);
    const newCursorPos = start + formatted.length;
    setSelection({ start: newCursorPos, end: newCursorPos });
  };

  const formatMarkers = [
    { label: "Ж", marker: "**" },
    { label: "К", marker: "_" },
    { label: "П", marker: "~~" },
    { label: "Пд", marker: "__" },
    { label: "S", marker: "||" },
  ];

  const renderReadStatus = (message) => {
    if (!message.readBy) return null;
    
    const readUsers = Object.keys(message.readBy).length;
    const isGroupChat = chatType === 'group';
    
    return (
      <View style={styles.readStatus}>
        {isGroupChat ? (
          <Text>{readUsers}/{totalMembers} переглянуто</Text>
        ) : (
          <FontAwesomeIcon 
            icon={readUsers > 0 ? faCheckDouble : faCheck} 
            color="#4CAF50"
          />
        )}
      </View>
    );
  };

  

  return (
    <View style={styles.container}>
      {pinnedMessagesForUser.length > 0 && (
        <View style={styles.pinnedMessageWrapper}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.pinnedMessagesContainer}
          >
            {pinnedMessagesForUser.map(pm => (
              <TouchableOpacity
                key={pm.id}
                onPress={() => scrollToMessage(pm.id)}
                style={{ width: screenWidth - 50 }}
              >
                <View style={styles.pinnedMessageBlock}>
                  {renderPinnedContent(pm)}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.pinIconContainer} onPress={() => { /* додаткова дія */ }}>
            <PinIcon width={24} height={24} fill="gray" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages.length > 0 ? messages : []}
        renderItem={({ item }) => (
          <View style={styles.dateGroup}>
            <View style={styles.dateBlock}>
              <Text style={styles.date}>{item.date}</Text>
            </View>
            {item.messages
              .filter(m => !m.deletedFor || !m.deletedFor[userId])
              .map((message, index) => {
                const isCurrentUser = message.senderId === userId;
                const isLastMessageFromUser =
                  index === item.messages.length - 1 ||
                  (item.messages[index + 1] && item.messages[index + 1].senderId !== message.senderId);
                const parts = splitMessageIntoParts(message.text);

                const showNewHeader = originalFirstUnreadId === message.id;

                return (
                  <React.Fragment key={message.id}>
                    {showNewHeader && (
                      <View style={styles.newMessagesBlock}>
                        <Text style={styles.newMessagesText}>Нові повідомлення</Text>
                      </View>
                    )}
                  <Menu style={styles.menu} key={message.id}>
                    <MenuTrigger onPress={() => handlePressMessage(message.id)}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        {(chatType !== 'private' && !isCurrentUser) && (
                          <View style={{ width: 30, marginRight: 8, marginTop: 'auto' }}>
                            {(index === item.messages.length - 1 ||
                              (item.messages[index + 1] && item.messages[index + 1].senderId !== message.senderId)
                            ) && (
                              <InterlocutorAvatar senderId={message.senderId} guildId={guildId} />
                            )}
                          </View>
                        )}
                        <View
                          ref={ref => messageRefs.current[message.id] = ref}
                          onLayout={(event) => {
                            const { height } = event.nativeEvent.layout;
                            setMessageHeights(prev => ({ ...prev, [message.id]: height }));
                          }}
                          style={[
                            styles.messageContainer,
                            isCurrentUser
                              ? [styles.myMessage, { marginLeft: 'auto' }]
                              : [styles.theirMessage, { marginLeft: 15 }],
                            (hasLinkOrImage(message) || message.replyTo) ? styles.standardBubble : styles.flexibleBubble,
                            highlightedMessageId === message.id && styles.highlightedMessage
                          ]}
                        >
                          <View style={styles.messageInnerContainer}>
                            {chatType === 'group' && message.senderId !== userId && (
                              <SenderName senderId={message.senderId} currentUserId={userId} />
                            )}
                            {message.replyTo && (
                              <TouchableOpacity onPress={() => scrollToMessage(message.replyTo)}>
                                <QuotedMessage replyTo={message.replyTo} guildId={guildId} chatId={chatId} />
                              </TouchableOpacity>
                            )}
                            {/* Якщо є зображення, спочатку зображення, потім текст; якщо немає, як раніше */}
                            {message.imageUrls && message.imageUrls.length > 0 ? (
                              message.imageUrls.length === 1 ? (
                                <>
                                  <SingleImage uri={message.imageUrls[0]} />
                                  {/* Текст після зображення, але тільки один раз, не дублюємо */}
                                  {parts
                                    .filter(p => p.type === 'text' && p.value.trim())
                                    .map((part, idx) =>
                                      <Text style={styles.messageText} key={`imgtext-${idx}`}>{part.value}</Text>
                                    )
                                  }
                                  {/* Лінки після тексту */}
                                  {parts.filter(p => p.type === 'link').map((part, idx) =>
                                    <LinkPreviewCard url={part.value} key={`imglink-${idx}`} />
                                  )}
                                </>
                              ) : (
                                <View style={styles.imagesContainer}>
                                  {(() => {
                                    const totalImages = message.imageUrls.length;
                                    const imagesPerRow = totalImages <= 4 ? totalImages : 4;
                                    const imageMargin = 4;
                                    const imageSize = (screenWidth - (imagesPerRow + 1) * imageMargin) / imagesPerRow;
                                    return message.imageUrls.map((imgUrl, i) => (
                                      <TouchableOpacity
                                        key={i}
                                        onPress={() => {
                                          setFullSizeImageUri(imgUrl);
                                          setFullSizeImageModalVisible(true);
                                        }}
                                        style={{ margin: imageMargin / 2 }}
                                      >
                                        <Image
                                          source={{ uri: imgUrl }}
                                          style={{ width: imageSize, height: imageSize, borderRadius: 10 }}
                                        />
                                      </TouchableOpacity>
                                    ));
                                  })()}
                                  {/* Текст після зображень, тільки один раз, не дублюємо */}
                                  {parts
                                    .filter(p => p.type === 'text' && p.value.trim())
                                    .map((part, idx) =>
                                      <Text style={styles.messageText} key={`imgtextmulti-${idx}`}>{part.value}</Text>
                                    )
                                  }
                                  {/* Лінки після тексту */}
                                  {parts.filter(p => p.type === 'link').map((part, idx) =>
                                    <LinkPreviewCard url={part.value} key={`imglinkmulti-${idx}`} />
                                  )}
                                </View>
                              )
                            ) : (
                              // Якщо немає зображень, як і раніше: текст і лінки у своєму порядку
                              parts.map((part, idx) => {
                                if (part.type === 'text') {
                                  if (!part.value.trim()) return null;
                                  return (
                                    <Text style={styles.messageText} key={idx}>
                                      {part.value}
                                    </Text>
                                  );
                                } else if (part.type === 'link') {
                                  return <LinkPreviewCard url={part.value} key={idx} />;
                                }
                                return null;
                              })
                            )}
                            <View style={styles.messageFooter}>
                              {/* Додаємо іконку PinIcon якщо повідомлення закріплене */}
                              {message.pinned && message.pinned.isPinned && (
                                <PinIcon width={16} height={16} fill="#0088cc" style={{ marginRight: 4 }} />
                              )}
                              {isCurrentUser && getStatusIcon(message)}
                              <Text style={styles.messageDate}>
                                {format(new Date(message.timestamp), 'H:mm', { locale })}
                              </Text>
                            </View>
                          </View>
                          {isLastMessageFromUser && (
                            <View style={[
                              styles.triangle,
                              isCurrentUser
                                ? (highlightedMessageId === message.id ? styles.triangleMyHighlighted : styles.triangleMy)
                                : (highlightedMessageId === message.id ? styles.triangleTheirHighlighted : styles.triangleTheir)
                            ]} />
                          )}
                        </View>
                      </View>
                    </MenuTrigger>
                    <MenuOptions style={isCurrentUser ? styles.popupMenuPersonal : styles.popupMenuInterlocutor}>
                      {isCurrentUser ? (
                        <>
                          {renderReadReceiptOption(message, true)}
                          <MenuOption value="reply" onSelect={() => handleReply(message)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <ReplyIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Відповісти</Text>
                            </View>
                          </MenuOption>
                          <MenuOption value="copy" onSelect={() => handleCopyMessage(message)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <CopyIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Копіювати</Text>
                            </View>
                          </MenuOption>
                          {message.pinned && message.pinned.isPinned ? (
                            <MenuOption value="unattach" onSelect={() => {}}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <UnpinIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                                <Text>Відкріпити</Text>
                              </View>
                            </MenuOption>
                          ) : (
                            <MenuOption value="attach1" onSelect={() => {
                              setPinMessageModalVisible(true);
                              // Додаємо виклик handleAttachMessage після підтвердження у модальному вікні
                            }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <PinsIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                                <Text>Закріпити</Text>
                              </View>
                            </MenuOption>
                          )}
                          <MenuOption value="edit" onSelect={() => handleEditMessage(message)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <PencilIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Редагувати</Text>
                            </View>
                          </MenuOption>
                          <MenuOption value="delete" onSelect={() => {
                            setMessageToDelete(message);
                            setDeleteModalVisible(true);
                          }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <DeleteIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Видалити</Text>
                            </View>
                          </MenuOption>
                        </>
                      ) : (
                        <>
                          {renderReadReceiptOption(message, false)}
                          <MenuOption value="reply" onSelect={() => handleReply(message)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <ReplyIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Відповісти</Text>
                            </View>
                          </MenuOption>
                          <MenuOption value="copy" onSelect={() => handleCopyMessage(message)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <CopyIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Копіювати</Text>
                            </View>
                          </MenuOption>
                          {message.pinned && message.pinned.isPinned ? (
                            <MenuOption value="unattach" onSelect={() => {
                              setMessageToUnpin(message);
                              setUnpinModalVisible(true);
                            }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <UnpinIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                                <Text>Відкріпити</Text>
                              </View>
                            </MenuOption>
                          ) : (
                            <MenuOption value="attach1" onSelect={() => {
                              setPinMessageModalVisible(true);
                              // Додаємо виклик handleAttachMessage після підтвердження у модальному вікні
                            }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <PinsIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                                <Text>Закріпити</Text>
                              </View>
                            </MenuOption>
                          )}
                          <MenuOption value="translate" onSelect={() => handleMenuOptionSelect('translate')}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TransleteIcon width={20} height={20} fill="gray" style={{ marginRight: 5 }} />
                              <Text>Перекласти</Text>
                            </View>
                          </MenuOption>
                        </>
                      )}
                    </MenuOptions>
                  </Menu>
                </React.Fragment>
                );
              })}
          </View>
        )}
        keyExtractor={(item) => item.date + item.messages[0].id}
        style={styles.messagesList}
        onViewableItemsChanged={handleViewableItemsChanged}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      />

      {replyToMessage && (
        <View style={styles.replyingToContainer}>
          <QuotedMessage replyTo={replyToMessage.id} guildId={guildId} chatId={chatId} />
          <TouchableOpacity onPress={() => {
            setReplyToMessage(null);
            setReplyToMessageText('');
          }}>
            <Text style={styles.cancelReplyText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { height: inputHeight }]}
            value={editMessage ? editMessageText : newMessage}
            onChangeText={editMessage ? setEditMessageText : setNewMessage}
            onContentSizeChange={handleContentSizeChange}
            multiline
            placeholder="Write a message..."
            onSelectionChange={(event) => {
              if (!editMessage) {
                setSelection(event.nativeEvent.selection);
              }
            }}
          />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              if (editMessage) {
                saveEditedMessage();
              } else if (newMessage.trim()) {
                handleSendMessage();
              } else {
                Alert.alert(
                  "Виберіть дію",
                  "",
                  [
                    { text: "Зображення", onPress: selectImage },
                    { text: "Скасувати", style: "cancel" }
                  ]
                );
              }
            }}
            onLongPress={() => setSendOptionsPopupVisible(true)}
          >
            <FontAwesomeIcon
              icon={editMessage || newMessage.trim() ? faPaperPlane : faPaperclip}
              size={24}
              style={editMessage || newMessage.trim() ? styles.blueIcon : styles.defaultIcon}
            />
          </TouchableOpacity>
        </View>
      </View>

      <SendOptionsPopup
        visible={sendOptionsPopupVisible}
        chatType={chatType}
        onClose={() => setSendOptionsPopupVisible(false)}
        onSendLater={() => {
          Alert.alert("Функція", "Надіслати пізніше");
        }}
        onSendToSelected={() => {
          Alert.alert("Функція", "Надіслати обраним");
        }}
        onFormatText={() => {
          setSendOptionsPopupVisible(false);
          setFormattingModalVisible(true);
        }}
      />

      <Modal
        animationType="fade"
        transparent={true}
        visible={isFormattingModalVisible}
        onRequestClose={() => setFormattingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formatModalContainer}>
            <Text style={styles.formatModalHeader}>Стилізація тексту</Text>
            <ScrollView style={styles.formatPreview}>
            <View style={styles.formatTextContainer}>
             <TextInput
               style={styles.formatText}
               multiline
               editable={false}
               value={newMessage}
               selection={selection}
               onSelectionChange={({ nativeEvent }) =>
                 setSelection(nativeEvent.selection)
               }
             />
           </View>
            </ScrollView>
            {/* Замініть <View style={styles.formatButtonsRow}>…</View> на це: */}
            <View style={styles.formatButtonsRow}>
              {formatMarkers.map(({ label, marker }, idx) => {
                const isEnabled = selection.start !== selection.end;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => wrapSelection(marker)}
                    disabled={!isEnabled}
                    style={[
                      styles.formatButton,
                      isEnabled
                        ? styles.formatButtonActive
                        : styles.formatButtonDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.formatButtonText,
                        isEnabled
                          ? styles.formatButtonTextActive
                          : styles.formatButtonTextDisabled,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>


            <View style={styles.formatModalActions}>
              <TouchableOpacity onPress={() => setFormattingModalVisible(false)} style={styles.formatModalActionButton}>
                <Text style={styles.formatModalActionText}>Закрити</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFormattingModalVisible(false)} style={styles.formatModalActionButton}>
                <Text style={styles.formatModalActionText}>Готово</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={captionModalVisible}
        onRequestClose={() => setCaptionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>Add a Caption</Text>
            {selectedImageUris.length > 0 && (
              <ScrollView horizontal style={{ marginBottom: 10 }}>
                {selectedImageUris.map((uri, index) => (
                  <Image
                    key={index}
                    source={{ uri }}
                    style={{ width: 80, height: 80, borderRadius: 10, marginRight: 10 }}
                  />
                ))}
              </ScrollView>
            )}
            <TextInput
              style={styles.imageTextInput}
              value={imageCaption}
              onChangeText={setImageCaption}
              placeholder="Enter a caption..."
            />
            <TouchableOpacity style={styles.buttonSendPhoto} onPress={uploadImageAndSaveMessage}>
              <Text style={styles.buttonText}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonCancelPhoto} onPress={() => setCaptionModalVisible(false)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={fullSizeImageModalVisible}
        onRequestClose={() => setFullSizeImageModalVisible(false)}
      >
        <View style={styles.fullSizeImageModalOverlay}>
          <TouchableOpacity
            style={styles.fullSizeImageModalContainer}
            onPress={() => setFullSizeImageModalVisible(false)}
          >
            <Image source={{ uri: fullSizeImageUri }} style={styles.fullSizeImage} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>Переклад</Text>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <Text style={styles.translatedText}>{translatedText}</Text>
            </ScrollView>
            <Button title="Закрити" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={commonModalStyles.overlay}>
          <View style={commonModalStyles.container}>
            <Text style={commonModalStyles.header}>Видалити повідомлення</Text>
            <View style={buttonContainerColumn}>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => handleDeleteMessage(true)}>
                <Text style={commonModalStyles.buttonText}>Видалити для всіх</Text>
              </TouchableOpacity>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => handleDeleteMessage(false)}>
                <Text style={commonModalStyles.buttonText}>Видалити для себе</Text>
              </TouchableOpacity>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => setDeleteModalVisible(false)}>
                <Text style={commonModalStyles.buttonText}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={pinMessageModalVisible}
        onRequestClose={() => setPinMessageModalVisible(false)}
      >
        <View style={commonModalStyles.overlay}>
          <View style={commonModalStyles.container}>
            <Text style={commonModalStyles.header}>Закріпити повідомлення</Text>
            <View style={buttonContainerColumn}>
              <TouchableOpacity
                style={commonModalStyles.button}
                onPress={async () => {
                  // Знаходимо повідомлення для закріплення
                  const selectedMessage = messages
                    .flatMap(group => group.messages)
                    .find(m => m.id === selectedMessageId);
                  if (selectedMessage) {
                    await handleAttachMessage(
                      selectedMessage,
                      userId,
                      guildId,
                      chatId,
                      false // тільки для себе
                    );
                  }
                  setPinMessageModalVisible(false);
                }}
              >
                <Text style={commonModalStyles.buttonText}>Закріпити для мене</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={commonModalStyles.button}
                onPress={async () => {
                  const selectedMessage = messages
                    .flatMap(group => group.messages)
                    .find(m => m.id === selectedMessageId);
                  if (selectedMessage) {
                    await handleAttachMessage(
                      selectedMessage,
                      userId,
                      guildId,
                      chatId,
                      true // для всіх
                    );
                  }
                  setPinMessageModalVisible(false);
                }}
              >
                <Text style={commonModalStyles.buttonText}>Закріпити для всіх</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={commonModalStyles.button}
                onPress={() => setPinMessageModalVisible(false)}
              >
                <Text style={commonModalStyles.buttonText}>Скасувати</Text>
              </TouchableOpacity>
            </View>
                   </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={unpinModalVisible}
        onRequestClose={() => setUnpinModalVisible(false)}
      >
        <View style={commonModalStyles.overlay}>
          <View style={commonModalStyles.container}>
            <Text style={commonModalStyles.header}>Відкріпити повідомлення</Text>
            <View style={buttonContainerColumn}>
              {chatType === "group" ? (
                <>
                  <TouchableOpacity
                    style={commonModalStyles.button}
                    onPress={async () => {
                      await handleUnpinMessage(
                        messageToUnpin,
                        userId,
                        guildId,
                        chatId,
                        true // для всіх
                      );
                      setUnpinModalVisible(false);
                      setMessageToUnpin(null);
                    }}
                  >
                    <Text style={commonModalStyles.buttonText}>Відкріпити для всіх</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={commonModalStyles.button}
                    onPress={async () => {
                      await handleUnpinMessage(
                        messageToUnpin,
                        userId,
                        guildId,
                        chatId,
                        false // лише для себе
                      );
                      setUnpinModalVisible(false);
                      setMessageToUnpin(null);
                    }}
                  >
                    <Text style={commonModalStyles.buttonText}>Відкріпити для мене</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={commonModalStyles.button}
                    onPress={async () => {
                      await handleUnpinMessage(
                        messageToUnpin,
                        userId,
                        guildId,
                        chatId,
                        true // для обох у приватному чаті
                      );
                      setUnpinModalVisible(false);
                      setMessageToUnpin(null);
                    }}
                  >
                    <Text style={commonModalStyles.buttonText}>
                      Відкріпити для {contactName || "користувача"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={commonModalStyles.button}
                    onPress={async () => {
                      await handleUnpinMessage(
                        messageToUnpin,
                        userId,
                        guildId,
                        chatId,
                        false // лише для себе
                      );
                      setUnpinModalVisible(false);
                      setMessageToUnpin(null);
                    }}
                  >
                    <Text style={commonModalStyles.buttonText}>Відкріпити для мене</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={commonModalStyles.button}
                onPress={() => {
                  setUnpinModalVisible(false);
                  setMessageToUnpin(null);
                }}
              >
                <Text style={commonModalStyles.buttonText}>Відміна</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    justifyContent: "space-between",
  },
  dateGroup: {
    marginBottom: 10,
  },
  dateBlock: {
    alignItems: 'center',
    marginVertical: 10,
  },
  date: {
    fontSize: 14,
    color: "#fff",
    backgroundColor: "#999",
    padding: 5,
    borderRadius: 10,
  },
  newMessagesBlock: {
    alignItems: 'center',
    marginVertical: 10,
  },
  newMessagesText: {
    fontSize: 14,
    color: '#fff',
    backgroundColor: '#2296f3',
    padding: 5,
    borderRadius: 10,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  messageContainer: {
    marginVertical: 5,
    padding: 10,
    borderRadius: 10,
    position: 'relative',
  },
  standardBubble: {
    width: "80%",
  },
  flexibleBubble: {
    maxWidth: "80%",
    minWidth: "40%",
  },
  myMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#e6f4fd",
    zIndex: 1,
  },
  theirMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#fefacd",
    zIndex: 1,
  },
  messageText: {
    fontSize: 16,
    marginBottom: 2,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  messageDate: {
    fontSize: 12,
    color: '#888',
    marginLeft: 6,
  },
  inputContainer: {
    padding: 10,
    backgroundColor: "#fff",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    padding: 10,
    fontSize: 16,
  },
  iconButton: {
    marginHorizontal: 5,
  },
  blueIcon: {
    color: "#007bff",
  },
  defaultIcon: {
    color: "#ccc",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: "#fff"
  },
  triangle: {
    width: 0,
    height: 0,
    borderStyle: "solid",
    position: 'absolute',
  },
  triangleMy: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#e6f4fd",
    zIndex: -1,
    bottom: 0,
    right: -10,
  },
  triangleTheir: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#fefacd",
    zIndex: -1,
    bottom: 0,
    left: -10,
  },
  triangleMyHighlighted: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#2296f3",
    zIndex: -1,
    bottom: 0,
    right: -10,
  },
  triangleTheirHighlighted: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#2296f3",
    zIndex: -1,
    bottom: 0,
    left: -10,
  },
  menu: {
    position: 'relative',
  },
  popupMenuInterlocutor: {
    position: 'absolute',
    left: 10,
    top: 0,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  popupMenuPersonal: {
    backgroundColor: '#ffffff',
    position: 'absolute',
    right: -155,
    top: 0,
    fontSize: 20,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  pinnedMessageWrapper: {
    flexDirection: 'row',
    width: screenWidth,
    height: 50,
  },
  pinnedMessagesContainer: {
    width: screenWidth - 50,
  },
  pinnedMessageBlock: {
    width: screenWidth - 50,
    height: 50,
    backgroundColor: '#fff',
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  pinnedContentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  quotedContentRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#d0e4f9",
    padding: 5,
    borderRadius: 10,
  },
  visualElementContainer: {
    width: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  pinnedImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  pinnedTextColumn: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    paddingLeft: 5,
  },
  pinnedHeader: {
    fontSize: 12,
    color: "#0088cc",
    marginBottom: 2,
  },
  pinnedText: {
    fontSize: 14,
    color: "#333",
  },
  pinnedLabel: {
    fontSize: 14,
    color: "gray",
  },
  pinIconContainer: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIcon: {
    width: 24,
    height: 24,
    backgroundColor: 'transparent',
  },
  unpinButton: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  unpinText: {
    fontSize: 16,
    color: '#ff0000',
  },
  replyingToContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    padding: 5,
  },
  replyingToText: {
    flex: 1,
    fontStyle: 'italic',
    color: '#666',
  },
  cancelReplyText: {
    color: '#007bff',
    marginLeft: 10,
  },
  highlightedMessage: {
    backgroundColor: '#2296f3',
    borderWidth: 1,
    borderColor: '#2296f3',
  },
  imageTextInput: {
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    width: '100%',
    marginBottom: 20,
  },
  buttonSendPhoto: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonCancelPhoto: {
    backgroundColor: '#ddd',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  popupOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  sendOptionsPopup: {
    position: "absolute",
    bottom: 70,
    right: 20,
    width: 250,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    alignItems: "flex-start",
  },
  sendOptionButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  sendOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "100%",
  },
  sendOptionText: {
    fontSize: 16,
    color: "#333",
    textAlign: "left",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: "80%",
    alignItems: "center",
    elevation: 2,
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  fullSizeImageModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  fullSizeImageModalContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  fullSizeImage: {
    width: "100%",
    height: "100%",
  },
  scrollContent: {
    paddingVertical: 10,
  },
  translatedText: {
    fontSize: 16,
    color: "#333",
    textAlign: "center",
  },
  statusIcon: {
    color: "#8e8e8e",
  },
  secondCheck: {
    marginLeft: -8,
  },
  doubleCheckContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 5,
  },
  imagesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 5,
  },
  linkPreviewContainer: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    backgroundColor: "#fff",
    width: "100%",
    position: "relative",
  },
  linkPreviewImage: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
    marginRight: 8,
  },
  linkPreviewTextContainer: {
    flex: 2,
    justifyContent: "center",
  },
  linkPreviewTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  linkPreviewDescription: {
    fontSize: 12,
    color: "#555",
  },
  youtubeIconContainer: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    padding: 2,
  },
  docsIconContainer: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    padding: 2,
  },
  singleImage: {
    width: "100%",
  },
  senderId: {
    fontSize: 10,
    color: "gray",
    marginBottom: 2,
  },
  interlocutorAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  // Стилі для модального вікна стилізації тексту
  formatModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    alignItems: 'center',
  },
  formatModalHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  formatPreview: {
    maxHeight: 150,
    width: '100%',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  formatButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  formatButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  formatButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  formatModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
  formatModalActionButton: {
    marginLeft: 16,
  },
  formatModalActionText: {
    color: '#1e88e5',
    fontWeight: '500',
  },
  formatTextContainer: {
    maxHeight: 150,
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  formatText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
  },
  // кнопки стилізації
  formatButtonActive:   {
    backgroundColor: '#007bff' 
  },  // синій активний фон
  formatButtonDisabled: {
    backgroundColor: '#e0e0e0' 
  },  // сірий неактивний фон
  formatButtonTextActive:   {
    color: '#fff'
  },           // білий текст
  formatButtonTextDisabled: {
    color: '#aaa'
  },           // сірий текст
  readReceiptOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  readReceiptAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 5,
  },
  readByPopup: {
    position: 'absolute',
    top: 0,
    width: 160,
    maxHeight: 150,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 8,
    padding: 5,
    zIndex: 1000,
  },
  readByPopupLeft: {
    right: 170,
  },
  readByPopupRight: {
    left: 170,
  },
  readByItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  readByName: {
    flex: 1,
  },
  menuSeparator: {
    height: 1,
    backgroundColor: '#BDBDBD',
    marginVertical: 5,
  },

});


export default ChatWindow;
