import AsyncStorage from "@react-native-async-storage/async-storage";
import database from '@react-native-firebase/database';
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GuildContext } from "../GuildContext";
import { cachePushToken, uploadPushToken } from "../src/notifications/registerToken";

const UserSettingsScreen = ({ fetch }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [guilds, setGuilds] = useState([]);
  const { setGuildId } = useContext(GuildContext);

  const selectGuild = async (guild) => {
    try {
      await AsyncStorage.setItem("guildId", guild.guildId);
      setGuildId(guild.guildId);
      fetch();
    } catch (error) {
      console.error("Помилка при виборі гільдії:", error);
    }
  };

  const apply = async () => {
    console.log("--- Начинаю процесс входа по коду доступа ---");
    console.log("Введенный код доступа (пароль):", `"${password}"`);

    if (!password || password.trim() === "") {
        console.log("ОШИБКА: Поле ввода пустое.");
        Alert.alert(t("userSettings.userNotFoundTitle"), t("userSettings.userNotFoundMessage"));
        return;
    }

    try {
        console.log("Шаг 1: Ищу пользователя с таким паролем...");
        const user = await getUser(password);

        if (!user) {
          console.log("РЕЗУЛЬТАТ: Пользователь с таким паролем не найден в базе данных.");
          Alert.alert(
            t("userSettings.userNotFoundTitle"),
            t("userSettings.userNotFoundMessage"),
            [{ text: t("userSettings.ok") }]
          );
          return;
        }

        console.log("УСПЕХ! Пользователь найден:", user);
        
        console.log("Шаг 2: Сохраняю userId в AsyncStorage...");
        await AsyncStorage.setItem("userId", user.userId);
        console.log("userId сохранен.");
        
        console.log("Шаг 3: Получаю FCM токен от Firebase...");
        const token = await cachePushToken();
        console.log("Результат получения токена:", token ? 'успех' : 'не удалось получить токен');

        console.log("Шаг 4: Сохраняю токен в базу данных...");
        await uploadPushToken(user.userId, token);
        console.log("Токен зарегистрирован.");

        console.log("Шаг 5: Ищу гильдии, в которых состоит пользователь...");
        const userGuilds = await getGuildsByUser(user);

        if (userGuilds.length <= 0) {
          console.log("РЕЗУЛЬТАТ: У пользователя нет привязки ни к одной гильдии.");
          Alert.alert(
            t("userSettings.noGuildsTitle"),
            t("userSettings.noGuildsMessage"),
            [{ text: t("userSettings.ok") }]
          );
          return;
        }

        console.log("УСПЕХ! Найдены гильдии:", userGuilds);

        if (userGuilds.length === 1) {
          console.log("Обнаружена одна гильдия, вхожу автоматически...");
          selectGuild(userGuilds[0]);
          return;
        }

        console.log("Обнаружено несколько гильдий, показываю модальное окно выбора...");
        setGuilds(userGuilds);

    } catch (error) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА в функции apply:", error);
        Alert.alert("Ошибка", "Произошла непредвиденная ошибка.");
    }
  };

  const getUser = async (password) => {
    const snapshot = await database().ref("users").once('value');
    if (!snapshot.exists()) return null;

    const allUsers = snapshot.val();
    const userId = Object.keys(allUsers).find(
      (key) => allUsers[key].password === password
    );

    if (!userId) return null;
    return { ...allUsers[userId], userId };
  };

  const getGuildsByUser = async (user) => {
    const guildSnapshot = await database().ref("guilds").once('value');
    if (!guildSnapshot.exists()) return [];

    const allGuilds = guildSnapshot.val();
    return Object.keys(allGuilds)
      .map((guildId) => {
        if (user[guildId]) {
          return {
            ...user[guildId],
            guildId,
            ...allGuilds[guildId],
          };
        }
        return null;
      })
      .filter(Boolean);
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