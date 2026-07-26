import { useContext, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ИСПРАВЛЕНО: Правильный импорт
import AsyncStorage from "@react-native-async-storage/async-storage";
import database from "@react-native-firebase/database";
import { useTranslation } from "react-i18next";
import CryptoJS from "react-native-crypto-js";
import { GuildContext } from "../GuildContext";
import { DarkThemeColors } from "../constants/theme";
// ИСПРАВЛЕНО: Правильный импорт и название функции
import { cachePushToken, uploadPushToken } from "../src/notifications/registerToken";

const AdminSelectScreen = ({
  guildData,
  clanCaption,
  guildId,
  uril,
  selectedWorld,
  fetch,
}) => {
  const { t } = useTranslation();
  const [selectedMember, setSelectedMember] = useState(null);
  const [imageLoadingStates, setImageLoadingStates] = useState({});
  const { setGuildId } = useContext(GuildContext);

  const handleItemPress = (item) => {
    setSelectedMember(item);
  };

  const handleConfirm = async () => {
    if (!selectedMember) return;

    const selectedUserId = selectedMember.linkUrl.split("/").pop();
    const formattedGuildId = `${uril}_${guildId}`;

    // ИСПРАВЛЕНО: Правильный синтаксис
    const guildRef = database().ref(`guilds/${formattedGuildId}`);
    const guildInfo = {
      guildName: clanCaption,
      worldName: selectedWorld,
      setting: {
        GBGGoal: true,
      },
    };

    try {
      // 3. Записываем данные гильдии
      await guildRef.set(guildInfo);
      console.log(`Дані гільдії оновлено для id: ${formattedGuildId}`);

      // 4. Оновлюємо / створюємо користувачів у Firebase
      await Promise.all(
        guildData.map(async (member) => {
          const userId = member.linkUrl.split("/").pop();
          const imageUrl = `https://foe.scoredb.io${member.imageUrl}`;

          const userGuildData = {
            [formattedGuildId]: {
              imageUrl: imageUrl,
              role: userId === selectedUserId ? "guildLeader" : "member",
            },
          };

          const userGuildUserData = {
            userName: member.name,
            imageUrl: imageUrl,
          };

          // ИСПРАВЛЕНО: Правильный синтаксис
          const userRef = database().ref(`users/${userId}`);
          const snapshot = await userRef.once('value');
          
          if (snapshot.exists()) {
            await userRef.update(userGuildData);
          } else {
            const encryptedUserId = CryptoJS.AES.encrypt(
              userId,
              "your-encryption-key"
            ).toString();
            const userRootData = {
              userName: member.name,
              password: encryptedUserId,
              ...userGuildData,
            };
            await userRef.set(userRootData);
          }

          const userInGuildRef = database().ref(`guilds/${formattedGuildId}/guildUsers/${userId}`);
          await userInGuildRef.set(userGuildUserData);
        })
      );

      console.log("Запрашиваю FCM токен і кешую перед збереженням облікового запису...");
      await cachePushToken();

      await AsyncStorage.setItem("guildId", formattedGuildId);
      await AsyncStorage.setItem("userId", selectedUserId);
      setGuildId(formattedGuildId);
      
      // ІСПРАВЛЕНО: Вызов правильной функции без лишнего аргумента
      await uploadPushToken(selectedUserId);

      if (typeof fetch === "function") {
        fetch();
      }
      setSelectedMember(null);

    } catch (error) {
      console.error("Помилка при оновленні даних:", error);
    }
  };

  const handleCancel = () => {
    setSelectedMember(null);
  };

  const renderItem = ({ item }) => {
    // ... (эта функция не меняется)
    const imageUrl = `https://foe.scoredb.io${item.imageUrl}`;
    const isLoading = imageLoadingStates[item.name] ?? true;

    return (
      <TouchableOpacity
        onPress={() => handleItemPress(item)}
        style={styles.itemButton}
      >
        <View style={styles.itemContainer}>
          <View style={styles.imageContainer}>
            {item.imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                onLoadEnd={() =>
                  setImageLoadingStates((prev) => ({
                    ...prev,
                    [item.name]: false,
                  }))
                }
                onError={(error) => {
                  console.warn("Помилка завантаження зображення:", error);
                  setImageLoadingStates((prev) => ({
                    ...prev,
                    [item.name]: false,
                  }));
                }}
              />
            ) : null}
          </View>
          {isLoading && <ActivityIndicator size="small" color="#fff" />}
          <Text style={styles.name}>{item.name}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    // ... (JSX не меняется)
    <View style={styles.container}>
      <Text style={styles.title}>{t("adminSelect.title")}</Text>
      <FlatList
        data={guildData}
        renderItem={renderItem}
        keyExtractor={(item) => item.name}
        ListEmptyComponent={
          <Text style={styles.errorText}>
            {t("adminSelect.emptyMessage")}
          </Text>
        }
      />

      <Modal
        visible={selectedMember !== null}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedMember && (
              <>
                <Image
                  source={{
                    uri: `https://foe.scoredb.io${selectedMember.imageUrl}`,
                  }}
                  style={styles.modalImage}
                />
                <Text style={styles.modalName}>{selectedMember.name}</Text>
                <Text style={styles.confirmationText}>
                  {t("adminSelect.confirmationText")}
                </Text>
                <View style={styles.buttonContainer}>
                  <TouchableOpacity onPress={handleConfirm} style={styles.button}>
                    <Text style={styles.buttonText}>{t("adminSelect.confirmButton")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCancel} style={styles.button}>
                    <Text style={styles.buttonText}>{t("adminSelect.cancelButton")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ... (стили не меняются)
const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      width: "100%",
      backgroundColor: DarkThemeColors.background,
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 20,
      color: DarkThemeColors.text,
    },
    itemButton: {
      marginBottom: 10,
    },
    itemContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 5,
      backgroundColor: DarkThemeColors.surfaceElevated,
      borderColor: DarkThemeColors.border,
      borderWidth: 1,
      marginBottom: 10,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 1,
    },
    imageContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: "hidden",
      marginRight: 15,
    },
    image: {
      width: "100%",
      height: "100%",
    },
    name: {
      fontSize: 16,
      color: DarkThemeColors.text,
    },
    modalContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: DarkThemeColors.overlay,
    },
    modalContent: {
      backgroundColor: DarkThemeColors.surface,
      borderColor: DarkThemeColors.border,
      borderWidth: 1,
      padding: 20,
      borderRadius: 10,
      alignItems: "center",
    },
    modalImage: {
      width: 100,
      height: 100,
      marginBottom: 10,
      borderRadius: 50,
    },
    modalName: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 20,
      color: DarkThemeColors.text,
    },
    confirmationText: {
      fontSize: 16,
      marginBottom: 10,
      color: DarkThemeColors.textSecondary,
    },
    buttonContainer: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 20,
    },
    button: {
      backgroundColor: DarkThemeColors.primary,
      padding: 10,
      borderRadius: 5,
      marginHorizontal: 5,
    },
    buttonText: {
      color: DarkThemeColors.text,
      textAlign: "center",
    },
    errorText: {
      textAlign: "center",
      marginVertical: 20,
      color: "red",
    },
  });

export default AdminSelectScreen;
