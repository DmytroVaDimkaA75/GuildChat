import React, { useState, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get } from "firebase/database";
import { database } from "../firebaseConfig";
import { GuildContext } from "../GuildContext";
import { useTranslation } from "react-i18next";
import { uploadFcmToken } from "../src/notifications/registerToken";

const UserSettingsScreen = ({ fetch }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [guilds, setGuilds] = useState([]);
  // Отримуємо setGuildId з контексту, щоб оновити значення глобального guildId
  const { setGuildId } = useContext(GuildContext);

  // Функція, яка зберігає обрану гільдію, оновлює контекст і викликає "fetch"
  const selectGuild = async (guild) => {
    try {
      await AsyncStorage.setItem("guildId", guild.guildId);
      setGuildId(guild.guildId); // Оновлюємо глобальний стан
      fetch();
    } catch (error) {
      console.error("Помилка при виборі гільдії:", error);
    }
  };

  // Функція "apply" – обробляє логіку перевірки пароля та пошуку гільдій
  const apply = async () => {
    const user = await getUser(password);

    if (!user) {
      Alert.alert(
        t("userSettings.userNotFoundTitle"),
        t("userSettings.userNotFoundMessage"),
        [{ text: t("userSettings.ok") }]
      );
      return;
    }

    await AsyncStorage.setItem("userId", user.userId);
    //Пуш-токен: якщо він уже кешований — пишемо у БД
    const uploaded = await uploadFcmToken(user.userId, database);
    if (uploaded === false) {
      Alert.alert(
        t("notifications.permissionTitle"),
        t("notifications.permissionMessage"),
        [{ text: t("notifications.permissionButton") }]
      );
    }

    const userGuilds = await getGuildsByUser(user);

    if (userGuilds.length <= 0) {
      Alert.alert(
        t("userSettings.noGuildsTitle"),
        t("userSettings.noGuildsMessage"),
        [{ text: t("userSettings.ok") }]
      );
      return;
    }

    if (userGuilds.length === 1) {
      // Якщо лише одна гільдія — одразу обираємо її
      selectGuild(userGuilds[0]);
      return;
    }

    // Якщо кілька гільдій — показуємо список в модалці
    setGuilds(userGuilds);
  };

  // Отримати користувача за паролем
  const getUser = async (password) => {
    const snapshot = await get(ref(database, "users"));
    if (!snapshot.exists()) return null;

    const allUsers = snapshot.val();
    // Знаходимо userId з відповідним паролем
    const userId = Object.keys(allUsers).find(
      (key) => allUsers[key].password === password
    );

    if (!userId) return null;
    return { ...allUsers[userId], userId };
  };

  // Отримати список гільдій, у яких є користувач
  const getGuildsByUser = async (user) => {
    const guildSnapshot = await get(ref(database, "guilds"));
    if (!guildSnapshot.exists()) return [];

    const allGuilds = guildSnapshot.val();
    const guildIds = Object.keys(allGuilds);

    const existGuilds = guildIds
      .map((guildId) => {
        if (user[guildId]) {
          return {
            ...user[guildId],
            guildId,
            ...allGuilds[guildId],
          };
        }
      })
      .filter((item) => !!item);

    return existGuilds;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("userSettings.requestAccessCode")}</Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          onChangeText={setPassword}
          value={password}
          placeholder={t("userSettings.accessCodePlaceholder")}
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={apply}>
        <Text style={styles.buttonText}>{t("userSettings.apply")}</Text>
      </TouchableOpacity>

      {/* Модальне вікно для вибору гільдії (якщо їх декілька) */}
      <Modal
        visible={guilds.length > 0}
        animationType="slide"
        transparent
        onRequestClose={() => setGuilds([])}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t("userSettings.selectGuildTitle")}</Text>
            <FlatList
              data={guilds}
              keyExtractor={(item) => item.guildId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalButton, { marginBottom: 10 }]}
                  onPress={() => selectGuild(item)}
                >
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.flagImage}
                  />
                  <Text style={styles.modalButtonText}>{item.guildName}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[styles.modalButton, { marginBottom: 10 }]}
              onPress={() => setGuilds([])}
            >
              <Text style={styles.modalButtonText}>{t("userSettings.close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Стилі
const styles = StyleSheet.create({
  container: {
    padding: 40,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 10,
    width: "100%",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    padding: 10,
    borderRadius: 5,
    backgroundColor: "#f2f2f2",
    width: "100%",
  },
  button: {
    backgroundColor: "#29ABE2",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 5,
    marginBottom: 10,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    maxHeight: "50%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalButton: {
    backgroundColor: "#29ABE2",
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    borderColor: "white",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  modalButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    flex: 1,
  },
  flagImage: {
    width: 36,
    height: 24,
    marginRight: 10,
  },
});

export default UserSettingsScreen;
