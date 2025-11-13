import { faYoutube } from '@fortawesome/free-brands-svg-icons';
import {
  faChartSimple,
  faCheck,
  faCheckDouble,
  faClock,
  faFileAlt,
  faPaperclip,
  faPaperPlane,
  faTableCellsLarge
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from 'date-fns';
import { de, es, fr, ru, uk } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Clipboard,
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
  View
} from "react-native";
import { Menu, MenuOption, MenuOptions, MenuProvider, MenuTrigger } from 'react-native-popup-menu';
import uuid from 'react-native-uuid';

import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import moment from 'moment-timezone';
import DatePicker from 'react-native-date-picker';

import translateMessage from '../../translateMessage';
import CalendarclockIcon from '../ico/calendarclock.svg';
import ClockIcon from '../ico/clock.svg';
import CopyIcon from '../ico/copy.svg';
import DeleteIcon from '../ico/delete.svg';
import PencilIcon from '../ico/pencil.svg';
import PinIcon from '../ico/pin.svg';
import PinsIcon from '../ico/pins.svg';
import ReplyIcon from '../ico/reply.svg';
import TransleteIcon from '../ico/translete.svg';
import UnpinIcon from '../ico/unpin.svg';
import UsercheckIcon from '../ico/usercheck.svg';

const SendOptionsPopup = ({ visible, chatType, onClose, onSendLater, onSendToSelected }) => {
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

const Spoiler = ({ content }) => {
    const [visible, setVisible] = useState(false);
    return (
        <TouchableOpacity onPress={() => setVisible(!visible)}>
            <Text style={[styles.messageText, visible ? {} : styles.spoilerHidden]}>
                {visible ? content : 'Натисніть, щоб побачити'}
            </Text>
        </TouchableOpacity>
    );
};

const parseFormattedText = (text) => {
    const parts = [];
    let lastIndex = 0;
    const regex = /(\*\*(.*?)\*\*|__(.*?)__|_(.*?)_|~~(.*?)~~|\|\|(.*?)\|\|)/g;
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
    const parts = parseFormattedText(text);
    return (
        <Text style={styles.messageText}>
            {parts.map((part, index) => {
                switch (part.type) {
                    case 'bold':
                        return <Text key={index} style={{ fontWeight: 'bold' }}>{part.content}</Text>;
                    case 'italic':
                        return <Text key={index} style={{ fontStyle: 'italic' }}>{part.content}</Text>;
                    case 'underline':
                        return <Text key={index} style={{ textDecorationLine: 'underline' }}>{part.content}</Text>;
                    case 'strikethrough':
                        return <Text key={index} style={{ textDecorationLine: 'line-through' }}>{part.content}</Text>;
                    case 'spoiler':
                         return <Spoiler key={index} content={part.content} />;
                    default:
                        return <Text key={index}>{part.content}</Text>;
                }
            })}
        </Text>
    );
};

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

const handleAttachMessage = async (message, userId, guildId, chatId, pinForAllOrUser) => {
  try {
    const messageRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${message.id}/pinned`);
    let pinnedFor = { [userId]: true };

    if (pinForAllOrUser) {
      const chatMembersRef = database().ref(`guilds/${guildId}/chats/${chatId}/members`);
      const snapshot = await chatMembersRef.once('value');
      if (snapshot.exists()) {
        const members = snapshot.val();
        Object.keys(members).forEach((memberId) => {
          pinnedFor[memberId] = true;
        });
      }
    }
    await messageRef.update({
      isPinned: true,
      pinnedFor: pinnedFor,
    });
  } catch (error) {
    console.error("Error pinning message:", error);
  }
};

const handleUnpinMessage = async (message, userId, guildId, chatId, forAll) => {
  try {
    const pinnedRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${message.id}/pinned`);
    if (forAll) {
      await pinnedRef.remove();
    } else {
      const pinnedForRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${message.id}/pinned/pinnedFor/${userId}`);
      await pinnedForRef.remove();
    }
  } catch (error) {
    console.error("Error unpinning message:", error);
  }
};

const SenderName = ({ senderId, currentUserId }) => {
  const [userName, setUserName] = useState(null);
  useEffect(() => {
    if (senderId !== currentUserId) {
      const userRef = database().ref(`users/${senderId}/userName`);
      const onValueChange = userRef.on('value', (snapshot) => {
        setUserName(snapshot.val() || null);
      });
      return () => userRef.off('value', onValueChange);
    }
  }, [senderId, currentUserId]);
  return userName ? <Text style={styles.senderId}>{userName}</Text> : null;
};

const InterlocutorAvatar = ({ senderId, guildId }) => {
  const [avatar, setAvatar] = useState(null);
  useEffect(() => {
    if (senderId && guildId) {
      const userRef = database().ref(`guilds/${guildId}/guildUsers/${senderId}`);
      const onValueChange = userRef.on('value', (snapshot) => {
        setAvatar(snapshot.val()?.imageUrl || null);
      });
      return () => userRef.off('value', onValueChange);
    }
  }, [senderId, guildId]);
  if (!avatar) return null;
  return <Image source={{ uri: avatar }} style={styles.interlocutorAvatar} />;
};

const ReadUserInline = ({ userId, guildId, maxLength = 12 }) => {
  const [info, setInfo] = useState({ name: '', avatar: '' });
  useEffect(() => {
    if (userId && guildId) {
      database().ref(`guilds/${guildId}/guildUsers/${userId}`).once('value')
        .then((snap) => {
          const data = snap.val() || {};
          setInfo({ name: data.userName || '', avatar: data.imageUrl || '' });
        })
        .catch((e) => console.error('Error fetching user info', e));
    }
  }, [userId, guildId]);
  const displayName = info.name.length > maxLength ? info.name.slice(0, maxLength) + '…' : info.name;
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
      database().ref(`guilds/${guildId}/guildUsers/${userId}`).once('value')
        .then((snap) => {
          const data = snap.val() || {};
          setInfo({ name: data.userName || '', avatar: data.imageUrl || '' });
        })
        .catch((e) => console.error('Error fetching user info', e));
    }
  }, [userId, guildId]);
  const displayName = info.name.length > 20 ? info.name.slice(0, 20) + '…' : info.name;
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
    <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.popupOverlay}>
      <View
        style={[
          styles.readUsersPopup,
          isCurrentUser ? styles.readUsersPopupPersonal : styles.readUsersPopupInterlocutor,
        ]}
      >
        <ScrollView>
          {entries.map(([uid]) => (
            <ReadUserRow key={uid} userId={uid} guildId={guildId} />
          ))}
        </ScrollView>
      </View>
    </TouchableOpacity>
  );
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
        visualElement = <FontAwesomeIcon icon={faYoutube} size={24} color="#FF0000" />;
        const title =
          quotedMessage.previewData && quotedMessage.previewData.title
            ? quotedMessage.previewData.title
            : firstUrl;
        const extraText = quotedMessage.text.replace(urlRegex, "").trim();
        textContent = extraText || title;
      } else {
        visualElement = <FontAwesomeIcon icon={getDocsIcon(firstUrl)} size={24} color="#4285F4" />;
        const extraText = quotedMessage.text.replace(urlRegex, "").trim();
        textContent = extraText || (quotedMessage.title || firstUrl);
      }
    } else if (quotedMessage.previewImage) {
      visualElement = <Image source={{ uri: quotedMessage.previewImage }} style={styles.pinnedImage} resizeMode="cover" />;
      const extraText = quotedMessage.text.replace(urlRegex, "").trim();
      textContent = extraText || (quotedMessage.title || firstUrl);
    } else {
      visualElement = <PinnedPreview url={firstUrl} />;
      const extraText = quotedMessage.text.replace(urlRegex, "").trim();
      textContent = extraText || (quotedMessage.title || firstUrl);
    }
  } else if (hasImages) {
    visualElement = <Image source={{ uri: quotedMessage.imageUrls[0] }} style={styles.pinnedImage} resizeMode="cover" />;
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
    database().ref(`guilds/${guildId}/chats/${chatId}/messages/${replyTo}`).once('value')
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

const buttonContainerColumn = {
  flexDirection: 'column',
  alignSelf: 'stretch',
  justifyContent: 'center',
};

const ChatWindow = ({ route, navigation }) => {
  const { chatId } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [inputHeight, setInputHeight] = useState(40);
  const maxInputHeight = 120;
  const [userId, setUserId] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [setContactAvatar] = useState(null);
  const [contactName, setContactName] = useState(null);
  const [chatType, setChatType] = useState(null);
  const [totalMembers, setTotalMembers] = useState(0);
  const [locale, setLocale] = useState(uk);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [selectedImageUris, setSelectedImageUris] = useState([]);
  const [imageCaption, setImageCaption] = useState("");
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [fullSizeImageUri, setFullSizeImageUri] = useState(null);
  const [fullSizeImageModalVisible, setFullSizeImageModalVisible] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [replyToMessageText, setReplyToMessageText] = useState('');
  const [sendOptionsPopupVisible, setSendOptionsPopupVisible] = useState(false);
  const processedMessages = useRef(new Set());
  const [unpinModalVisible, setUnpinModalVisible] = useState(false);
  const [messageToUnpin, setMessageToUnpin] = useState(null);
  const [readUsersPopupFor, setReadUsersPopupFor] = useState(null);
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
  const hasSetOriginalUnreadId = useRef(false);

  const handleFormatText = (marker) => {
    const { start, end } = selection;
    if (start === end) return;
    const currentText = editMessage ? editMessageText : newMessage;
    const before = currentText.slice(0, start);
    const selected = currentText.slice(start, end);
    const after = currentText.slice(end);
    const newText = `${before}${marker}${selected}${marker}${after}`;
    if (editMessage) {
        setEditMessageText(newText);
    } else {
        setNewMessage(newText);
    }
  };

  const handleReply = (message) => {
    setReplyToMessage(message);
    setReplyToMessageText(message.text);
  };

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

const handleScheduleSend = (date) => {
    setDatePickerVisible(false);
    if (newMessage.trim() === "") {
        Alert.alert("Помилка", "Спочатку введіть текст повідомлення.");
        return;
    }
    const scheduledKyivTime = moment.tz(date, "Europe/Kiev");
    const nowInKyiv = moment.tz("Europe/Kiev");
    if (scheduledKyivTime.isBefore(nowInKyiv)) {
      Alert.alert("Невірний час", "Не можна запланувати відправку на час, що вже минув.");
      return;
    }
    const utcTimestamp = scheduledKyivTime.valueOf();
    const scheduledMessageData = {
        text: newMessage,
        senderId: userId,
        guildId: guildId,
        chatId: chatId,
        sendAt: utcTimestamp,
        status: "pending",
        replyTo: replyToMessage ? replyToMessage.id : null,
    };
    database().ref('scheduledMessages').push(scheduledMessageData)
      .then(() => {
        setNewMessage("");
        setReplyToMessage(null);
        setInputHeight(40);
        Alert.alert(
          "Заплановано", 
          `Ваше повідомлення буде відправлено ${scheduledKyivTime.format('DD.MM.YYYY о HH:mm')}`
        );
      })
      .catch(error => {
        Alert.alert("Помилка планування", error.message);
      });
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
          <Text>{formatReadTime(readTime)}</Text>
        </View>
        <View style={styles.menuSeparator} />
      </>
    );
  };

  const renderGroupReadReceiptOption = (message, isCurrentUser) => {
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
        <TouchableOpacity
          disabled={extra <= 0}
          onPress={() => extra > 0 && setReadUsersPopupFor(message.id)}
        >
          <View style={styles.readReceiptOption}>
            <FontAwesomeIcon icon={faCheckDouble} size={16} color="#4CAF50" style={{ marginRight: 5 }} />
            <ReadUserInline userId={firstId} guildId={guildId} />
            {extra > 0 && (
              <Text style={styles.extraCount}> (+{extra})</Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
      </>
    );
  };

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
          database().ref(path).set(currentTime)
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

  useEffect(() => {
    const fetchUserIdAndGuildId = async () => {
      setUserId(await AsyncStorage.getItem("userId"));
      setGuildId(await AsyncStorage.getItem("guildId"));
    };
    fetchUserIdAndGuildId();
  }, []);

  useEffect(() => {
    if (userId) {
      const localeRef = database().ref(`users/${userId}/setting/language`);
      const onValueChange = localeRef.on('value', (snapshot) => {
        const localeCode = snapshot.val();
        setLocale(locales[localeCode] || uk);
      });
      return () => localeRef.off('value', onValueChange);
    }
  }, [userId]);

useEffect(() => {
  if (!chatId || !guildId) return;
  const chatRef = database().ref(`guilds/${guildId}/chats/${chatId}`);
  const onChatValueChange = chatRef.on('value', (snapshot) => {
    const chatData = snapshot.val();
    if (!chatData) return;
    setChatType(chatData.type || 'private');
    if (chatData.members) {
      const memberCount = Object.keys(chatData.members).length;
      setTotalMembers(memberCount);
    } else {
      setTotalMembers(0);
    }
    if (chatData.type === 'group') {
      navigation.setOptions({
        headerTitle: () => (
          <View style={styles.headerContent}>
            {chatData.groupAvatar && (
              <Image source={{ uri: chatData.groupAvatar }} style={styles.groupAvatar} />
            )}
            <Text style={styles.headerTitle}>{chatData.name}</Text>
          </View>
        )
      });
    } else if (chatData.type === 'private' && userId) {
      const otherUserId = Object.keys(chatData.members || {}).find(id => id !== userId);
      if (otherUserId) {
        const userRef = database().ref(`guilds/${guildId}/guildUsers/${otherUserId}`);
        userRef.once('value', (userSnap) => {
          const userData = userSnap.val();
          if (userData) {
            setContactAvatar(userData.imageUrl);
            setContactName(userData.userName);
            navigation.setOptions({
              headerTitle: () => (
                <View style={styles.headerContent}>
                  {userData.imageUrl && (
                    <Image source={{ uri: userData.imageUrl }} style={styles.avatar} />
                  )}
                  <Text style={styles.headerTitle}>{userData.userName}</Text>
                </View>
              ),
            });
          }
        });
      }
    }
  });
  return () => chatRef.off('value', onChatValueChange);
}, [chatId, guildId, navigation, userId]);
  
useEffect(() => {
  if (!chatId || !guildId || !userId) return;
  const messagesRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
  const onMessagesChange = messagesRef.on('value', (snapshot) => {
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
      messages: groupedMessages[date].sort((a, b) => a.timestamp - b.timestamp),
      type: 'date'
    }));
    setMessages(groupedMessagesArray.sort((a, b) => a.messages[0].timestamp - b.messages[0].timestamp));
  });
  return () => messagesRef.off('value', onMessagesChange);
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
    if (initialScrollDone || !flatListRef.current || messages.length === 0) return;
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
      if (!guildIdFromStorage || !chatId) {
        throw new Error('Не удалось получить guildId или chatId.');
      }
      const messageRef = database().ref(`guilds/${guildIdFromStorage}/chats/${chatId}/messages`).push();
      await messageRef.set({
        text: imageCaption,
        timestamp: Date.now(),
        senderId: userIdFromStorage,
        status: 'sending',
      });
      const imageUrls = [];
      for (const uri of selectedImageUris) {
        const imageId = uuid.v4();
        const reference = storage().ref(`images/${imageId}.jpeg`);
        await reference.putFile(uri);
        const imageUrl = await reference.getDownloadURL();
        imageUrls.push(imageUrl);
      }
      await messageRef.update({ imageUrls, status: 'sent' });
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
      if (!chatId || !userId || !guildId) throw new Error("Missing IDs");
      const messagesRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
      const newMessageRef = messagesRef.push();
      await newMessageRef.set({
        senderId: userId,
        text: newMessage,
        timestamp: Date.now(),
        status: 'sending',
        replyTo: replyToMessage ? replyToMessage.id : null,
        replyToText: replyToMessage ? replyToMessage.text : null,
      });
      const updates = { status: 'sent' };
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
          updates.previewData = { title, image };
        } catch (e) {
          console.error("Error fetching preview for message:", e);
        }
      }
      await newMessageRef.update(updates);
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
          const translationRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${selectedMessageId}/translate/${locale.code}`);
          const snapshot = await translationRef.once('value');
          if (snapshot.exists()) {
            setTranslatedText(snapshot.val());
          } else {
            const translated = await translateMessage(selectedMessage.text, locale.code);
            await translationRef.set(translated);
            setTranslatedText(translated);
          }
          setModalVisible(true);
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
      const messageRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${messageToDelete.id}`);
      if (deleteForBoth) {
        await messageRef.remove();
      } else {
        await messageRef.update({ deletedFor: { [userId]: true } });
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
      const messageRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${editMessage.id}`);
      await messageRef.update({
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
        visualElement = <FontAwesomeIcon icon={faYoutube} size={24} color="#FF0000" />;
        const title =
          message.previewData && message.previewData.title
            ? message.previewData.title
            : firstUrl;
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || title;
      } else if (isDocsURL(firstUrl)) {
        visualElement = <FontAwesomeIcon icon={getDocsIcon(firstUrl)} size={24} color="#4285F4" />;
        const extraText = message.text.replace(urlRegex, "").trim();
        textContent = extraText || (message.title || firstUrl);
      } else if (message.previewImage) {
        visualElement = <Image source={{ uri: message.previewImage }} style={styles.pinnedImage} resizeMode="cover" />;
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
      visualElement = <Image source={{ uri: message.imageUrls[0] }} style={styles.pinnedImage} resizeMode="cover" />;
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
    <MenuProvider style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
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
          <TouchableOpacity style={styles.pinIconContainer} onPress={() => {}}>
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
                            {message.imageUrls && message.imageUrls.length > 0 ? (
                              message.imageUrls.length === 1 ? (
                                <>
                                  <SingleImage uri={message.imageUrls[0]} />
                                  {parts
                                    .filter(p => p.type === 'text' && p.value.trim())
                                    .map((part, idx) =>
                                       <FormattedText text={part.value} key={`imgtext-${idx}`} />
                                    )
                                  }
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
                                  {parts
                                    .filter(p => p.type === 'text' && p.value.trim())
                                    .map((part, idx) =>
                                      <FormattedText text={part.value} key={`imgtextmulti-${idx}`} />
                                    )
                                  }
                                  {parts.filter(p => p.type === 'link').map((part, idx) =>
                                    <LinkPreviewCard url={part.value} key={`imglinkmulti-${idx}`} />
                                  )}
                                </View>
                              )
                            ) : (
                              parts.map((part, idx) => {
                                if (part.type === 'text') {
                                  if (!part.value.trim()) return null;
                                  return <FormattedText text={part.value} key={idx} />;
                                } else if (part.type === 'link') {
                                  return <LinkPreviewCard url={part.value} key={idx} />;
                                }
                                return null;
                              })
                            )}
                            <View style={styles.messageFooter}>
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
                      {renderGroupReadReceiptOption(message, isCurrentUser)}
                      {isCurrentUser ? (
                        <>
                          {renderReadReceiptOption(message)}
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
                    {readUsersPopupFor === message.id && (
                      <ReadUsersPopup
                        message={message}
                        guildId={guildId}
                        isCurrentUser={isCurrentUser}
                        onClose={() => setReadUsersPopupFor(null)}
                      />
                    )}
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
            selectionColor="#2296f3"
            contextMenuHidden={false}
            selection={{ start: selection.start, end: selection.end }}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            selectTextOnFocus={false}
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
        {selection.start !== selection.end && (
            <View style={styles.formatButtonsContainer}>
                <TouchableOpacity style={styles.formatButton} onPress={() => handleFormatText('**')}>
                    <Text style={styles.formatButtonText}>Жирний</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.formatButton} onPress={() => handleFormatText('_')}>
                    <Text style={styles.formatButtonText}>Курсив</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.formatButton} onPress={() => handleFormatText('~~')}>
                    <Text style={styles.formatButtonText}>Закреслений</Text>
                </TouchableOpacity>
                 <TouchableOpacity style={styles.formatButton} onPress={() => handleFormatText('__')}>
                    <Text style={styles.formatButtonText}>Підкреслений</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.formatButton} onPress={() => handleFormatText('||')}>
                    <Text style={styles.formatButtonText}>Спойлер</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>

      <SendOptionsPopup
          visible={sendOptionsPopupVisible}
          chatType={chatType}
          onClose={() => setSendOptionsPopupVisible(false)}
          onSendLater={() => setDatePickerVisible(true)}
          onSendToSelected={() => Alert.alert("Функція", "Надіслати обраним")}
      />

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
                  const selectedMessage = messages
                    .flatMap(group => group.messages)
                    .find(m => m.id === selectedMessageId);
                  if (selectedMessage) {
                    await handleAttachMessage(
                      selectedMessage,
                      userId,
                      guildId,
                      chatId,
                      false
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
                      true
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
                        true
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
                        false
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
                        true
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
                        false
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
      <DatePicker
        modal
        open={isDatePickerVisible}
        date={new Date()}
        onConfirm={handleScheduleSend}
        onCancel={() => {
          setDatePickerVisible(false);
        }}
        title="Запланувати відправку"
        confirmText="Підтвердити"
        cancelText="Скасувати"
        minimumDate={new Date()}
      />
    </KeyboardAvoidingView>
    </MenuProvider>
  );
};

// Стилі залишаються ті ж, що й у попередньому повідомленні.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
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
    borderTopWidth: 1,
    borderTopColor: '#ddd',
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
  readReceiptOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  readUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  readUserName: {
    fontSize: 12,
    marginRight: 4,
  },
  readUserAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  extraCount: {
    color: 'red',
  },
  readUsersPopup: {
    position: 'absolute',
    top: 0,
    width: 150,
    maxHeight: 150,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  readUsersPopupPersonal: {
    right: -310,
  },
  readUsersPopupInterlocutor: {
    left: 160,
  },
  menuSeparator: {
    height: 1,
    backgroundColor: '#BDBDBD',
    marginVertical: 5,
  },
  formatButtonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: '#f0f0f0',
      paddingVertical: 8,
      marginTop: 5,
      borderRadius: 20,
  },
  formatButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 15,
      backgroundColor: '#dcdcdc',
  },
  formatButtonText: {
      fontSize: 14,
      fontWeight: '500',
  },
  spoilerHidden: {
      backgroundColor: '#dcdcdc',
      color: '#dcdcdc',
      borderRadius: 5,
      overflow: 'hidden',
  },
});

export default ChatWindow;