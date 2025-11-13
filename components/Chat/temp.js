import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import { de, es, fr, ru, uk } from "date-fns/locale";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Menu, MenuOption, MenuOptions, MenuTrigger } from "react-native-popup-menu";
import uuid from "react-native-uuid";

import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import {
  faChartSimple,
  faCheck,
  faClock,
  faFileAlt,
  faPaperclip,
  faPaperPlane,
  faTableCellsLarge
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";

import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';

import translateMessage from "../../translateMessage";
import CustomCheckBox from "../CustomElements/CustomCheckBox3";
import PinIcon from "../ico/pin.svg";


const { width: screenWidth } = Dimensions.get("window");
const locales = { uk, ru, es, fr, de };

const commonModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  container: { backgroundColor: "#fff", borderRadius: 10, paddingVertical: 20, paddingHorizontal: 20, width: "80%", alignItems: "center", elevation: 2 },
  header: { fontSize: 18, fontWeight: "600", marginBottom: 10, textAlign: "center" },
  button: { marginHorizontal: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "stretch" },
  buttonText: { fontSize: 16, color: "#007aff", textAlign: "center" }
});

const buttonContainerRow = { flexDirection: "row", alignSelf: "stretch", justifyContent: "flex-end" };
const buttonContainerColumn = { flexDirection: "column", alignSelf: "stretch", justifyContent: "center" };

const isYouTubeURL = (url) => url.includes("youtube.com") || url.includes("youtu.be");
const isDocsURL = (url) => url.includes("docs.google.com");

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
    if (textParts[i]) result.push({ type: "text", value: textParts[i] });
    if (i < urls.length) result.push({ type: "link", value: urls[i] });
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
      {previewData.image && <Image source={{ uri: previewData.image }} style={styles.linkPreviewImage} resizeMode="contain" />}
      <View style={styles.linkPreviewTextContainer}>
        <Text style={styles.linkPreviewTitle} numberOfLines={2}>{previewData.title}</Text>
        {previewData.description ? <Text style={styles.linkPreviewDescription} numberOfLines={3}>{previewData.description}</Text> : null}
      </View>
      {isYouTubeURL(url) && <View style={styles.youtubeIconContainer}><FontAwesomeIcon icon={faYoutube} size={20} color="#FF0000" /></View>}
      {isDocsURL(url) && <View style={styles.docsIconContainer}><FontAwesomeIcon icon={getDocsIcon(url)} size={20} color="#4285F4" /></View>}
    </TouchableOpacity>
  );
};

const SingleImage = ({ uri }) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  useEffect(() => {
    Image.getSize(uri, (width, height) => setAspectRatio(width / height), (error) => console.error("Error getting image size", error));
  }, [uri]);
  return (
    <TouchableOpacity onPress={() => {}}>
      <Image source={{ uri }} style={[styles.singleImage, { aspectRatio }]} resizeMode="contain" />
    </TouchableOpacity>
  );
};

const PinnedContent = ({ message }) => {
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const urlRegex = /https?:\/\/[^\s]+/g;
  const hasLink = message.text ? urlRegex.test(message.text) : false;

  useEffect(() => {
    if (hasLink && !message.previewImage && !previewData) {
      const fetchPreview = async () => {
        setLoadingPreview(true);
        try {
          const urls = message.text.match(urlRegex) || [];
          const firstUrl = urls[0];
          const response = await fetch(firstUrl);
          const html = await response.text();
          const titleMatch = html.match(/<title>(.*?)<\/title>/i);
          const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i);
          const descMatch = html.match(/<meta property=["']og:description["'] content=["'](.*?)["']/i);
          const imageMatch = html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i);
          const title = ogTitleMatch ? ogTitleMatch[1] : titleMatch ? titleMatch[1] : firstUrl;
          let description = descMatch ? descMatch[1] : "";
          const image = imageMatch ? imageMatch[1] : null;
          if (isYouTubeURL(firstUrl)) description = "";
          setPreviewData({ title, description, image });
        } catch (error) {
          console.error("Error fetching preview in pinned content:", error);
        } finally {
          setLoadingPreview(false);
        }
      };
      fetchPreview();
    }
  }, [hasLink, message, previewData]);

  let visualElement = null;
  let textContent = null;

  if (hasLink) {
    const urls = message.text.match(urlRegex) || [];
    const firstUrl = urls[0];
    if (isYouTubeURL(firstUrl) || isDocsURL(firstUrl)) {
      visualElement = isYouTubeURL(firstUrl) ? <FontAwesomeIcon icon={faYoutube} size={24} color="#FF0000" /> : <FontAwesomeIcon icon={getDocsIcon(firstUrl)} size={24} color="#4285F4" />;
      const extraText = message.text.replace(urlRegex, "").trim();
      textContent = extraText || (message.title || firstUrl);
    } else if (message.previewImage || (previewData && previewData.image)) {
      const imageUri = message.previewImage || (previewData ? previewData.image : null);
      if (imageUri) visualElement = <Image source={{ uri: imageUri }} style={styles.pinnedImage} resizeMode="cover" />;
      const extraText = message.text.replace(urlRegex, "").trim();
      textContent = extraText || (message.title || (previewData ? previewData.title : firstUrl));
    } else {
      textContent = message.text;
    }
  } else if (message.imageUrls && message.imageUrls.length > 0) {
    visualElement = <Image source={{ uri: message.imageUrls[0] }} style={styles.pinnedImage} resizeMode="cover" />;
    textContent = (message.text && message.text.trim().length > 0) ? message.text : "Фото";
  } else if (message.text && message.text.trim().length > 0) {
    textContent = message.text;
  }

  const textColumn = (
    <View style={styles.pinnedTextColumn}>
      <Text style={styles.pinnedHeader}>Прикріплене повідомлення</Text>
      {textContent && <Text numberOfLines={1} style={styles.pinnedText}>{textContent}</Text>}
    </View>
  );

  return (
    <View style={styles.pinnedContentRow}>
      {visualElement && <View style={styles.visualElementContainer}>{visualElement}</View>}
      {textColumn}
    </View>
  );
};

const ChatWindow = ({ route, navigation }) => {
  const { chatId } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
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
  const [translatedText, setTranslatedText] = useState("");
  const [selectedImageUris, setSelectedImageUris] = useState([]);
  const [imageCaption, setImageCaption] = useState("");
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [fullSizeImageUri, setFullSizeImageUri] = useState(null);
  const [fullSizeImageModalVisible, setFullSizeImageModalVisible] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [replyToMessageText, setReplyToMessageText] = useState("");
  const flatListRef = useRef(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [editMessageText, setEditMessageText] = useState("");
  const [messageHeights, setMessageHeights] = useState({});
  const messageRefs = useRef({});
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [pinMessageModalVisible, setPinMessageModalVisible] = useState(false);
  const [pinForAllOrUser, setPinForAllOrUser] = useState(false);

  const handleReply = (message) => {
    setReplyToMessage(message);
    setReplyToMessageText(message.text);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "sending": return <FontAwesomeIcon icon={faClock} size={14} style={styles.statusIcon} />;
      case "sent": return <FontAwesomeIcon icon={faCheck} size={14} style={styles.statusIcon} />;
      case "read": return <View style={styles.doubleCheckContainer}><FontAwesomeIcon icon={faCheck} size={14} style={styles.statusIcon} /><FontAwesomeIcon icon={faCheck} size={14} style={[styles.statusIcon, styles.secondCheck]} /></View>;
      default: return null;
    }
  };

  useEffect(() => {
    if (pinMessageModalVisible) setPinForAllOrUser(false);
  }, [pinMessageModalVisible]);

  const handleContentSizeChange = (event) => {
    const { height } = event.nativeEvent.contentSize;
    const newHeight = Math.min(Math.max(40, height), maxInputHeight);
    setInputHeight(newHeight);
  };

  const pinnedMessagesForUser = messages.flatMap((group) => group.messages).filter((m) => m.pinned && m.pinned.pinnedFor && m.pinned.pinnedFor[userId]);

  useEffect(() => {
    const fetchUserAndGuildIds = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        const storedGuildId = await AsyncStorage.getItem("guildId");
        setUserId(storedUserId);
        setGuildId(storedGuildId);
      } catch (error) {
        console.error("Error fetching user or guild ID: ", error);
      }
    };
    fetchUserAndGuildIds();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const localeRef = database().ref(`users/${userId}/setting/language`);
    const onLocaleChange = snapshot => {
      const localeCode = snapshot.val();
      setLocale(locales[localeCode] || uk);
    };
    localeRef.on('value', onLocaleChange);
    return () => localeRef.off('value', onLocaleChange);
  }, [userId]);
  
  useEffect(() => {
    if (!chatId || !guildId || !userId) return;

    const chatRef = database().ref(`guilds/${guildId}/chats/${chatId}`);
    const onChatValue = snapshot => {
        const chatData = snapshot.val();
        if (!chatData) return;
        setChatType(chatData.type || "private");
        if (chatData.type === "group") {
            navigation.setOptions({ title: chatData.name });
        } else if (chatData.type === "private") {
            const members = chatData.members || {};
            const otherUserId = Object.keys(members).find((id) => id !== userId);
            if (otherUserId) {
                const userRef = database().ref(`guilds/${guildId}/guildUsers/${otherUserId}`);
                const onUserValue = userSnap => {
                    const userData = userSnap.val();
                    if (userData) {
                        setContactAvatar(userData.imageUrl);
                        setContactName(userData.userName);
                        navigation.setOptions({
                            headerTitle: () => (
                                <View style={styles.headerContent}>
                                    {userData.imageUrl && <Image source={{ uri: userData.imageUrl }} style={styles.avatar} />}
                                    <Text style={styles.headerTitle}>{userData.userName}</Text>
                                </View>
                            )
                        });
                    }
                };
                userRef.on('value', onUserValue);
                return () => userRef.off('value', onUserValue);
            }
        }
    };
    chatRef.on('value', onChatValue);
    return () => chatRef.off('value', onChatValue);
}, [chatId, guildId, navigation, userId]);


  useEffect(() => {
    if (!chatId || !userId || !guildId) return;
    const messagesRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
    const onMessages = snapshot => {
      if (!snapshot.exists()) return;
      const messagesData = snapshot.val();
      const updates = {};
      Object.entries(messagesData).forEach(([messageId, message]) => {
        if (message.senderId !== userId && message.status !== "read") {
          updates[`guilds/${guildId}/chats/${chatId}/messages/${messageId}/status`] = "read";
        }
      });
      if (Object.keys(updates).length > 0) {
        database().ref().update(updates);
      }
    };
    messagesRef.on('value', onMessages);
    return () => messagesRef.off('value', onMessages);
  }, [chatId, userId, guildId]);
  
  useEffect(() => {
      if (!chatId || !guildId) return;
      const messagesRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);
      const onMessagesValue = snapshot => {
          const messagesData = snapshot.val() || {};
          const messagesList = Object.keys(messagesData).map(key => ({ id: key, ...messagesData[key] }));
          const groupedMessages = messagesList.reduce((acc, message) => {
              const date = format(new Date(message.timestamp), "d MMMM", { locale });
              if (!acc[date]) acc[date] = [];
              acc[date].push(message);
              return acc;
          }, {});
          const groupedMessagesArray = Object.keys(groupedMessages).map(date => ({ date, messages: groupedMessages[date] }));
          setMessages(groupedMessagesArray);
      };
      messagesRef.on('value', onMessagesValue);
      return () => messagesRef.off('value', onMessagesValue);
  }, [chatId, guildId, locale]);

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
        allowsMultipleSelection: true
      });
      if (!result.canceled && result.assets) {
        const uris = result.assets.map((asset) => asset.uri);
        setSelectedImageUris(uris);
        setCaptionModalVisible(true);
      }
    } catch (error) {
      Alert.alert("Помилка", `Не вдалося вибрати зображення: ${error.message}`);
    }
  };

  const uploadImageAndSaveMessage = async () => {
    if (selectedImageUris.length === 0) return;
    try {
        const messageRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`).push();
        const temporaryMessage = { text: imageCaption, timestamp: Date.now(), senderId: userId, status: "sending" };
        await messageRef.set(temporaryMessage);
        const imageUrls = [];
        for (const uri of selectedImageUris) {
            const imageId = uuid.v4();
            const imageRef = storage().ref(`images/${imageId}.jpeg`);
            await imageRef.putFile(uri);
            const imageUrl = await imageRef.getDownloadURL();
            imageUrls.push(imageUrl);
        }
        await messageRef.update({ imageUrls, status: "sent" });
        setSelectedImageUris([]);
        setImageCaption("");
        setCaptionModalVisible(false);
    } catch (error) {
        Alert.alert("Помилка", `Не вдалося завантажити зображення: ${error.message}`);
    }
  };

  const handleMenuOptionSelect = async (option) => {
    if (selectedMessageId) {
      const selectedMessage = messages.flatMap((group) => group.messages).find((m) => m.id === selectedMessageId);
      if (!selectedMessage) return;
      if (option === "translate") {
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

  const handlePressMessage = (messageId) => setSelectedMessageId(messageId);

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
        status: "sent",
        replyTo: replyToMessage ? replyToMessage.id : null,
        replyToText: replyToMessage ? replyToMessage.text : null
      });
      setNewMessage("");
      setInputHeight(40);
      setReplyToMessage(null);
      setReplyToMessageText("");
    } catch (error) {
      console.error("Error sending message: ", error);
    }
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
        setDeleteModalVisible(false);
        setMessageToDelete(null);
    } catch (error) {
        console.error("Error deleting message: ", error);
    }
  };

  const handleCopyMessage = (message) => Clipboard.setString(message.text);
  const handleEditMessage = (message) => {
    setEditMessage(message);
    setEditMessageText(message.text);
  };

  const saveEditedMessage = async () => {
    if (!editMessage || editMessageText.trim() === "") return;
    try {
      const messageRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages/${editMessage.id}`);
      await messageRef.update({ text: editMessageText, edited: true });
      setEditMessage(null);
      setEditMessageText("");
    } catch (error) {
      console.error("Error editing message: ", error);
    }
  };
  
  const handleAttachMessage = async (message, currentUserId, currentGuildId, currentChatId, forAll) => {
    if (!message) return;
    try {
        const messageRef = database().ref(`guilds/${currentGuildId}/chats/${currentChatId}/messages/${message.id}`);
        const chatRef = database().ref(`guilds/${currentGuildId}/chats/${currentChatId}`);
        const chatSnapshot = await chatRef.once('value');
        const chatData = chatSnapshot.val();

        const pinnedData = { isPinned: true, pinnedBy: currentUserId, pinnedAt: Date.now(), pinnedFor: { [currentUserId]: true } };

        if (forAll && chatData.type === 'group') {
            Object.keys(chatData.members).forEach(memberId => {
                pinnedData.pinnedFor[memberId] = true;
            });
        } else if (forAll && chatData.type === 'private') {
            const otherUserId = Object.keys(chatData.members).find(id => id !== currentUserId);
            if (otherUserId) pinnedData.pinnedFor[otherUserId] = true;
        }
        
        await messageRef.update({ pinned: pinnedData });
    } catch (error) {
        console.error("Error pinning message: ", error);
    }
};

  const scrollToMessage = (messageId) => {
    const allMessages = messages.flatMap((group) => group.messages);
    const messageIndex = allMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;
    let scrollOffset = 0;
    for (let i = 0; i < messageIndex; i++) {
      const prevMessageId = allMessages[i].id;
      const messageHeight = messageHeights[prevMessageId] || 100;
      scrollOffset += messageHeight + 10;
    }
    const dateHeaderHeight = 50;
    const datesBeforeMessage = new Set(allMessages.slice(0, messageIndex).map((m) => format(new Date(m.timestamp), "d MMMM", { locale }))).size;
    scrollOffset += dateHeaderHeight * datesBeforeMessage;
    const windowHeight = Dimensions.get("window").height;
    const centerOffset = windowHeight / 2 - (messageHeights[messageId] || 100) / 2;
    flatListRef.current?.scrollToOffset({ offset: Math.max(0, scrollOffset - centerOffset), animated: true });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1500);
  };
  
  return (
    <View style={styles.container}>
      {pinnedMessagesForUser.length > 0 && (
        <View style={styles.pinnedMessageWrapper}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.pinnedMessagesContainer}>
            {pinnedMessagesForUser.map((pm) => (
              <TouchableOpacity key={pm.id} onPress={() => scrollToMessage(pm.id)} style={{ width: screenWidth - 50 }}>
                <View style={styles.pinnedMessageBlock}>
                  <PinnedContent message={pm} />
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
            <View style={styles.dateBlock}><Text style={styles.date}>{item.date}</Text></View>
            {item.messages.filter((m) => !m.deletedFor || !m.deletedFor[userId]).map((message, index) => {
                const isCurrentUser = message.senderId === userId;
                const isLastMessageFromUser = index === item.messages.length - 1 || (item.messages[index + 1] && item.messages[index + 1].senderId !== message.senderId);
                const parts = splitMessageIntoParts(message.text);
                return (
                  <Menu style={styles.menu} key={message.id}>
                    <MenuTrigger onPress={() => handlePressMessage(message.id)}>
                      <View ref={(ref) => (messageRefs.current[message.id] = ref)} onLayout={(event) => { const { height } = event.nativeEvent.layout; setMessageHeights((prev) => ({ ...prev, [message.id]: height })); }} style={[styles.messageContainer, isCurrentUser ? styles.myMessage : styles.theirMessage, hasLinkOrImage(message) ? styles.standardBubble : styles.flexibleBubble, highlightedMessageId === message.id && styles.highlightedMessage]}>
                        <View style={styles.messageInnerContainer}>
                          {message.replyTo && <TouchableOpacity onPress={() => scrollToMessage(message.replyTo)}><View style={styles.replyContainer}><Text style={styles.replyText} numberOfLines={1}>Replying to: {message.replyToText}</Text></View></TouchableOpacity>}
                          {parts.map((part, idx) => {
                            if (part.type === "text") {
                              if (!part.value.trim()) return null;
                              return <Text style={styles.messageText} key={idx}>{part.value}</Text>;
                            } else if (part.type === "link") {
                              return <LinkPreviewCard url={part.value} key={idx} />;
                            }
                            return null;
                          })}
                          {message.imageUrls && message.imageUrls.length > 0 && (
                            message.imageUrls.length === 1 ? <SingleImage uri={message.imageUrls[0]} /> :
                            <View style={styles.imagesContainer}>
                              {(() => {
                                const totalImages = message.imageUrls.length;
                                const imagesPerRow = totalImages <= 4 ? totalImages : 4;
                                const imageMargin = 4;
                                const imageSize = (screenWidth - (imagesPerRow + 1) * imageMargin) / imagesPerRow;
                                return message.imageUrls.map((imgUrl, i) => (
                                  <TouchableOpacity key={i} onPress={() => { setFullSizeImageUri(imgUrl); setFullSizeImageModalVisible(true); }} style={{ margin: imageMargin / 2 }}>
                                    <Image source={{ uri: imgUrl }} style={{ width: imageSize, height: imageSize, borderRadius: 10 }} />
                                  </TouchableOpacity>
                                ));
                              })()}
                            </View>
                          )}
                          <View style={styles.messageFooter}>
                            {isCurrentUser && getStatusIcon(message.status)}
                            <Text style={styles.messageDate}>{format(new Date(message.timestamp), "H:mm", { locale })}</Text>
                          </View>
                        </View>
                        {isLastMessageFromUser && <View style={[styles.triangle, isCurrentUser ? styles.triangleMy : styles.triangleTheir]} />}
                      </View>
                    </MenuTrigger>
                    <MenuOptions style={isCurrentUser ? styles.popupMenuPersonal : styles.popupMenuInterlocutor}>
                      {isCurrentUser ? (
                        <>
                          <MenuOption value="reply" onSelect={() => handleReply(message)}><Text>Відповісти</Text></MenuOption>
                          <MenuOption value="copy" onSelect={() => handleCopyMessage(message)}><Text>Копіювати</Text></MenuOption>
                          {message.pinned && message.pinned.isPinned ? <MenuOption value="unattach" onSelect={() => {}}><Text>Відкріпити</Text></MenuOption> : <MenuOption value="attach1" onSelect={() => setPinMessageModalVisible(true)}><Text>Закріпити</Text></MenuOption>}
                          <MenuOption value="edit" onSelect={() => handleEditMessage(message)}><Text>Редагувати</Text></MenuOption>
                          <MenuOption value="delete" onSelect={() => { setMessageToDelete(message); setDeleteModalVisible(true); }}><Text>Видалити</Text></MenuOption>
                        </>
                      ) : (
                        <>
                          <MenuOption value="reply" onSelect={() => handleReply(message)}><Text>Відповісти</Text></MenuOption>
                          <MenuOption value="copy" onSelect={() => handleCopyMessage(message)}><Text>Копіювати</Text></MenuOption>
                          {message.pinned && message.pinned.isPinned ? <MenuOption value="unattach" onSelect={() => {}}><Text>Відкріпити</Text></MenuOption> : <MenuOption value="attach1" onSelect={() => setPinMessageModalVisible(true)}><Text>Закріпити</Text></MenuOption>}
                          <MenuOption value="translate" onSelect={() => handleMenuOptionSelect("translate")}><Text>Перекласти</Text></MenuOption>
                        </>
                      )}
                    </MenuOptions>
                  </Menu>
                );
            })}
          </View>
        )}
        keyExtractor={(item) => item.date + item.messages[0].id}
        style={styles.messagesList}
        getItemLayout={(data, index) => ({ length: 100, offset: 100 * index, index })}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      />

      {replyToMessage && (
        <View style={styles.replyingToContainer}>
          <Text style={styles.replyingToText} numberOfLines={1}>Replying to: {replyToMessageText}</Text>
          <TouchableOpacity onPress={() => { setReplyToMessage(null); setReplyToMessageText(""); }}><Text style={styles.cancelReplyText}>Cancel</Text></TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput style={[styles.input, { height: inputHeight }]} value={editMessage ? editMessageText : newMessage} onChangeText={editMessage ? setEditMessageText : setNewMessage} onContentSizeChange={handleContentSizeChange} multiline placeholder="Write a message..." />
          <TouchableOpacity style={styles.iconButton} onPress={() => { if (editMessage) { saveEditedMessage(); } else if (newMessage.trim()) { handleSendMessage(); } else { Alert.alert("Виберіть дію", "", [{ text: "Зображення", onPress: selectImage }, { text: "Скасувати", style: "cancel" }]); } }}>
            <FontAwesomeIcon icon={editMessage || newMessage.trim() ? faPaperPlane : faPaperclip} size={24} style={editMessage || newMessage.trim() ? styles.blueIcon : styles.defaultIcon} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal animationType="fade" transparent={true} visible={pinMessageModalVisible} onRequestClose={() => setPinMessageModalVisible(false)}>
        <View style={commonModalStyles.overlay}>
          <View style={commonModalStyles.container}>
            <Text style={commonModalStyles.header}>Прикріпити повідомлення</Text>
            <Text style={{ marginVertical: 10 }}>Прикріпити повідомлення вгорі чату?</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 10 }}>
              <CustomCheckBox checked={pinForAllOrUser} onPress={() => setPinForAllOrUser(!pinForAllOrUser)} />
              <Text style={{ marginLeft: 8, fontSize: 16 }}>{chatType === "group" ? "Прикріпити для всіх" : `Прикріпити і для ${contactName}`}</Text>
            </View>
            <View style={buttonContainerRow}>
              <TouchableOpacity style={commonModalStyles.button} onPress={async () => { const allMessages = messages.flatMap((group) => group.messages); const selectedMessage = allMessages.find((m) => m.id === selectedMessageId); if (selectedMessage) { await handleAttachMessage(selectedMessage, userId, guildId, chatId, pinForAllOrUser); } setPinMessageModalVisible(false); }}>
                <Text style={commonModalStyles.buttonText}>Прикріпити</Text>
              </TouchableOpacity>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => setPinMessageModalVisible(false)}>
                <Text style={commonModalStyles.buttonText}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={captionModalVisible} onRequestClose={() => setCaptionModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>Add a Caption</Text>
            {selectedImageUris.length > 0 && <ScrollView horizontal style={{ marginBottom: 10 }}>{selectedImageUris.map((uri, index) => <Image key={index} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 10 }} />)}</ScrollView>}
            <TextInput style={styles.imageTextInput} value={imageCaption} onChangeText={setImageCaption} placeholder="Enter a caption..." />
            <TouchableOpacity style={styles.buttonSendPhoto} onPress={uploadImageAndSaveMessage}><Text style={styles.buttonText}>Send</Text></TouchableOpacity>
            <TouchableOpacity style={styles.buttonCancelPhoto} onPress={() => setCaptionModalVisible(false)}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={fullSizeImageModalVisible} onRequestClose={() => setFullSizeImageModalVisible(false)}>
        <View style={styles.fullSizeImageModalOverlay}>
          <TouchableOpacity style={styles.fullSizeImageModalContainer} onPress={() => setFullSizeImageModalVisible(false)}>
            <Image source={{ uri: fullSizeImageUri }} style={styles.fullSizeImage} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </Modal>
      
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>Переклад</Text>
            <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.translatedText}>{translatedText}</Text></ScrollView>
            <Button title="Закрити" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={deleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={commonModalStyles.overlay}>
          <View style={commonModalStyles.container}>
            <Text style={commonModalStyles.header}>Видалити повідомлення</Text>
            <View style={buttonContainerColumn}>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => handleDeleteMessage(true)}><Text style={commonModalStyles.buttonText}>Видалити для всіх</Text></TouchableOpacity>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => handleDeleteMessage(false)}><Text style={commonModalStyles.buttonText}>Видалити для себе</Text></TouchableOpacity>
              <TouchableOpacity style={commonModalStyles.button} onPress={() => setDeleteModalVisible(false)}><Text style={commonModalStyles.buttonText}>Скасувати</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "white", justifyContent: "space-between" },
    dateGroup: { marginBottom: 10 },
    dateBlock: { alignItems: "center", marginVertical: 10 },
    date: { fontSize: 14, color: "#fff", backgroundColor: "#999", padding: 5, borderRadius: 10 },
    messagesList: { flex: 1, paddingHorizontal: 10 },
    messageContainer: { marginVertical: 5, padding: 10, borderRadius: 10, position: "relative" },
    standardBubble: { width: "80%" },
    flexibleBubble: { maxWidth: "80%", alignSelf: 'flex-start' },
    myMessage: { alignSelf: "flex-end", backgroundColor: "#DCF8C6" },
    theirMessage: { alignSelf: "flex-start", backgroundColor: "#ECECEC" },
    messageText: { fontSize: 16, marginBottom: 2 },
    messageFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 8 },
    messageDate: { fontSize: 12, color: "#888", marginLeft: 6 },
    inputContainer: { padding: 10, backgroundColor: "#fff" },
    inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: 20, paddingHorizontal: 10 },
    input: { flex: 1, padding: 10, fontSize: 16 },
    iconButton: { marginHorizontal: 5 },
    blueIcon: { color: "#007bff" },
    defaultIcon: { color: "#ccc" },
    headerContent: { flexDirection: "row", alignItems: "center" },
    avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
    headerTitle: { fontSize: 18, fontWeight: "bold" },
    triangle: { width: 0, height: 0, borderStyle: "solid", position: "absolute", backgroundColor: 'transparent' },
    triangleMy: { borderTopWidth: 10, borderLeftWidth: 10, borderTopColor: 'transparent', borderLeftColor: '#DCF8C6', bottom: 0, right: -10 },
    triangleTheir: { borderTopWidth: 10, borderRightWidth: 10, borderTopColor: 'transparent', borderRightColor: '#ECECEC', bottom: 0, left: -10 },
    menu: { position: "relative" },
    popupMenuInterlocutor: { position: "absolute", left: 10, top: 0, backgroundColor: "#ffffff", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#cccccc" },
    popupMenuPersonal: { backgroundColor: "#ffffff", position: "absolute", right: 0, top: 0, fontSize: 20, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#cccccc" },
    pinnedMessageWrapper: { flexDirection: "row", width: screenWidth, height: 50 },
    pinnedMessagesContainer: { width: screenWidth - 50 },
    pinnedMessageBlock: { width: screenWidth - 50, height: 50, backgroundColor: "#fff", paddingHorizontal: 5, justifyContent: "center" },
    pinnedContentRow: { flexDirection: "row", alignItems: "center" },
    visualElementContainer: { width: 50, justifyContent: "center", alignItems: "center" },
    pinnedImage: { width: 40, height: 40, borderRadius: 4 },
    pinnedTextColumn: { flex: 1, flexDirection: "column", justifyContent: "center", paddingLeft: 5 },
    pinnedHeader: { fontSize: 12, color: "gray", marginBottom: 2 },
    pinnedText: { fontSize: 14, color: "#333" },
    pinIconContainer: { width: 50, height: 50, justifyContent: "center", alignItems: "center" },
    replyingToContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#f2f2f2", padding: 5 },
    replyingToText: { flex: 1, fontStyle: "italic", color: "#666" },
    cancelReplyText: { color: "#007bff", marginLeft: 10 },
    highlightedMessage: { backgroundColor: "#a7d8ff" },
    imageTextInput: { padding: 15, fontSize: 16, borderWidth: 1, borderColor: "#ddd", borderRadius: 20, width: "100%", marginBottom: 20 },
    buttonSendPhoto: { backgroundColor: "#007bff", padding: 15, borderRadius: 10, width: "100%", alignItems: "center", marginBottom: 10 },
    buttonCancelPhoto: { backgroundColor: "#ddd", padding: 15, borderRadius: 10, width: "100%", alignItems: "center" },
    buttonText: { color: "white", fontWeight: "bold" },
    fullSizeImageModalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.8)" },
    fullSizeImageModalContainer: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
    fullSizeImage: { width: "100%", height: "100%" },
    replyContainer: { borderLeftWidth: 2, borderLeftColor: "#ccc", paddingLeft: 10, marginBottom: 5, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4 },
    replyText: { fontStyle: "italic", color: "#666", overflow: "hidden" },
    scrollContent: { paddingVertical: 10 },
    translatedText: { fontSize: 16, color: "#333", textAlign: "center" },
    statusIcon: { color: "#8e8e8e" },
    secondCheck: { marginLeft: -8 },
    doubleCheckContainer: { flexDirection: "row", alignItems: "center" },
    imagesContainer: { flexDirection: "row", flexWrap: "wrap", marginVertical: 5 },
    linkPreviewContainer: { flexDirection: "row", borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 8, marginTop: 8, backgroundColor: "#fff", width: "100%", position: "relative" },
    linkPreviewImage: { flex: 1, aspectRatio: 1, borderRadius: 4, marginRight: 8 },
    linkPreviewTextContainer: { flex: 2, justifyContent: "center" },
    linkPreviewTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
    linkPreviewDescription: { fontSize: 12, color: "#555" },
    youtubeIconContainer: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 12, padding: 2 },
    docsIconContainer: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 12, padding: 2 },
    singleImage: { width: "100%", borderRadius: 10 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContainer: { width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
    modalHeader: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    messageInnerContainer: {}
});
export default ChatWindow;