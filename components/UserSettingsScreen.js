import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
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
import { DarkThemeColors } from "../constants/theme";
import { cachePushToken, uploadPushToken } from "../src/notifications/registerToken";

const UserSettingsScreen = ({ fetch, navigation }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [guilds, setGuilds] = useState([]);
  const { setGuildId } = useContext(GuildContext);

  const selectGuild = async (guild) => {
    try {
      await AsyncStorage.setItem("guildId", guild.guildId);
      setGuildId(guild.guildId);
      if (typeof fetch === "function") {
        await fetch(guild.guildId);
      }
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
        
        console.log("Шаг 2: Запрашиваю FCM токен и кеширую его...");
        await cachePushToken();

        console.log("Шаг 3: Сохраняю userId в AsyncStorage...");
        await AsyncStorage.setItem("userId", user.userId);
        console.log("userId сохранен.");
        
        console.log("Шаг 4: Регистрирую токен для пуш-уведомлений сразу после входа...");
        // ИСПРАВЛЕНО: Вызываем правильную функцию `uploadPushToken`
        await uploadPushToken(user.userId);
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
        if (user.userGuilds?.[guildId]) {
          return {
            ...user.userGuilds[guildId],
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
      <TouchableOpacity activeOpacity={0.8} onPress={() => navigation?.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={22} color={DarkThemeColors.text} />
      </TouchableOpacity>
      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="key-outline" size={29} color={DarkThemeColors.primary} /></View>
        <Text style={styles.title}>{t("userSettings.requestAccessCode")}</Text>
        <Text style={styles.subtitle}>Введіть код, отриманий від керівника вашої гільдії</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color={DarkThemeColors.textSecondary} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={DarkThemeColors.primary}
            style={styles.input}
            onChangeText={setPassword}
            value={password}
            placeholder={t("userSettings.accessCodePlaceholder")}
            placeholderTextColor={DarkThemeColors.textSecondary}
          />
        </View>
        <TouchableOpacity activeOpacity={0.8} style={styles.button} onPress={apply}>
          <Text style={styles.buttonText}>{t("userSettings.apply")}</Text>
          <Ionicons name="arrow-forward" size={19} color="#fff" />
        </TouchableOpacity>
      </View>
      <Modal
        visible={guilds.length > 0}
        animationType="slide"
        transparent
        onRequestClose={() => setGuilds([])}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("userSettings.selectGuildTitle")}</Text>
            <FlatList
              data={guilds}
              keyExtractor={(item) => item.guildId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalButton, { marginBottom: 10 }]}
                  onPress={() => selectGuild(item)}
                >
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.flagImage} /> : <View style={styles.guildIcon}><Ionicons name="shield-outline" size={20} color={DarkThemeColors.primary} /></View>}
                  <Text style={styles.modalButtonText}>{item.guildName}</Text>
                  <Ionicons name="chevron-forward" size={20} color={DarkThemeColors.textSecondary} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setGuilds([])}
            >
              <Text style={styles.closeButtonText}>{t("userSettings.close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 22,
      width: "100%",
      justifyContent: "center",
      backgroundColor: DarkThemeColors.background,
    },
    card: { width: "100%", maxWidth: 460, alignSelf: "center", backgroundColor: DarkThemeColors.surface, borderWidth: 1, borderColor: DarkThemeColors.border, borderRadius: 22, padding: 20 },
    backButton: { position: "absolute", top: 18, left: 18, zIndex: 5, width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: DarkThemeColors.surface, borderWidth: 1, borderColor: DarkThemeColors.border },
    iconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: DarkThemeColors.surfaceElevated, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 7,
      textAlign: "center",
      color: DarkThemeColors.text,
    },
    subtitle: { color: DarkThemeColors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 20 },
    inputContainer: {
      minHeight: 52,
      marginBottom: 12,
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: DarkThemeColors.border,
      borderRadius: 13,
      backgroundColor: DarkThemeColors.background,
    },
    input: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 10,
      color: DarkThemeColors.text,
      fontSize: 15,
    },
    button: {
      backgroundColor: DarkThemeColors.primary,
      minHeight: 50,
      paddingHorizontal: 18,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      width: "100%",
    },
    buttonText: {
      color: DarkThemeColors.text,
      fontSize: 16,
      fontWeight: "bold",
    },
    modalContainer: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: DarkThemeColors.overlay,
    },
    modalContent: {
      backgroundColor: DarkThemeColors.surface,
      padding: 20,
      paddingTop: 10,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: DarkThemeColors.border,
      maxHeight: "65%",
    },
    modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: DarkThemeColors.border, alignSelf: "center", marginBottom: 18 },
    modalTitle: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 16,
      color: DarkThemeColors.text,
    },
    modalButton: {
      backgroundColor: DarkThemeColors.surfaceElevated,
      minHeight: 58,
      paddingHorizontal: 13,
      borderRadius: 13,
      marginBottom: 10,
      borderColor: DarkThemeColors.border,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    modalButtonText: {
      color: DarkThemeColors.text,
      fontSize: 16,
      fontWeight: "700",
      flex: 1,
    },
    flagImage: {
      width: 40,
      height: 40,
      borderRadius: 12,
      marginRight: 12,
    },
    guildIcon: { width: 40, height: 40, borderRadius: 12, marginRight: 12, alignItems: "center", justifyContent: "center", backgroundColor: DarkThemeColors.background },
    closeButton: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: DarkThemeColors.border, alignItems: "center", justifyContent: "center", marginTop: 4 },
    closeButtonText: { color: DarkThemeColors.primarySoft, fontSize: 15, fontWeight: "800" },
  });

export default UserSettingsScreen;
