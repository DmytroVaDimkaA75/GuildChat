import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
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
import { DarkThemeColors } from "../constants/theme";
import {
  authenticateLegacyAccount,
  discardAuthenticatedSession,
} from "../src/auth/googleAuth";
import { loadGuildsForUser } from "../src/auth/userGuilds";

const createSessionError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const UserSettingsScreen = ({ navigation, onCompleteAppSession }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [guilds, setGuilds] = useState([]);
  const [pendingUserId, setPendingUserId] = useState("");
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const showLoginError = (error) => {
    const code = String(error?.code || "");
    if (
      code === "functions/unauthenticated" ||
      code === "google/access-code-required"
    ) {
      Alert.alert(
        t("userSettings.userNotFoundTitle"),
        t("userSettings.userNotFoundMessage"),
        [{ text: t("userSettings.ok") }]
      );
      return;
    }

    if (code === "app/session-membership-missing") {
      Alert.alert(
        t("userSettings.noGuildsTitle"),
        t("userSettings.noGuildsMessage")
      );
      return;
    }

    console.error("Помилка входу за кодом:", code || "unknown");
    Alert.alert(
      t("userSettings.loginErrorTitle"),
      t("userSettings.loginErrorMessage")
    );
  };

  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    return navigation.addListener("beforeRemove", (event) => {
      if (!isBusy) return;
      event.preventDefault();
    });
  }, [isBusy, navigation]);

  const completeSession = async (userId, guildId) => {
    if (typeof onCompleteAppSession !== "function") {
      throw createSessionError(
        "app/session-unavailable",
        "Session completion is unavailable"
      );
    }
    await onCompleteAppSession({ userId, guildId });
  };

  const selectGuild = async (guild) => {
    if (isBusy || !pendingUserId || !guild?.guildId) return;
    setIsBusy(true);
    setSelectedGuildId(guild.guildId);

    try {
      await completeSession(pendingUserId, guild.guildId);
      setGuilds([]);
      setPendingUserId("");
    } catch (error) {
      await discardAuthenticatedSession();
      setGuilds([]);
      setPendingUserId("");
      showLoginError(error);
    } finally {
      setSelectedGuildId("");
      setIsBusy(false);
    }
  };

  const apply = async () => {
    if (isBusy) return;
    const accessCode = password.trim();
    if (!accessCode) {
      Alert.alert(
        t("userSettings.userNotFoundTitle"),
        t("userSettings.userNotFoundMessage")
      );
      return;
    }

    setIsBusy(true);
    let hasAuthenticatedSession = false;

    try {
      const account = await authenticateLegacyAccount({ accessCode });
      hasAuthenticatedSession = true;
      const userId = String(account?.userId || "").trim();
      if (!userId) {
        throw createSessionError(
          "app/session-invalid",
          "The authenticated user identity is missing"
        );
      }

      const availableGuilds = await loadGuildsForUser(userId);
      setPassword("");

      if (availableGuilds.length === 0) {
        await discardAuthenticatedSession();
        hasAuthenticatedSession = false;
        Alert.alert(
          t("userSettings.noGuildsTitle"),
          t("userSettings.noGuildsMessage"),
          [{ text: t("userSettings.ok") }]
        );
        return;
      }

      if (availableGuilds.length === 1) {
        await completeSession(userId, availableGuilds[0].guildId);
        hasAuthenticatedSession = false;
        return;
      }

      setPendingUserId(userId);
      setGuilds(availableGuilds);
      hasAuthenticatedSession = false;
    } catch (error) {
      if (hasAuthenticatedSession) {
        await discardAuthenticatedSession();
      }
      setPassword("");
      showLoginError(error);
    } finally {
      setIsBusy(false);
    }
  };

  const closeGuildModal = async () => {
    if (isBusy) return;
    setIsBusy(true);
    await discardAuthenticatedSession();
    setGuilds([]);
    setPendingUserId("");
    setIsBusy(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.8}
        disabled={isBusy}
        onPress={() => navigation?.goBack()}
        style={[styles.backButton, isBusy && styles.disabledButton]}
      >
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
            secureTextEntry
            editable={!isBusy}
            selectionColor={DarkThemeColors.primary}
            style={styles.input}
            onChangeText={setPassword}
            value={password}
            placeholder={t("userSettings.accessCodePlaceholder")}
            placeholderTextColor={DarkThemeColors.textSecondary}
            returnKeyType="done"
            onSubmitEditing={apply}
          />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          disabled={isBusy}
          style={[styles.button, isBusy && styles.disabledButton]}
          onPress={apply}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.buttonText}>{t("userSettings.apply")}</Text>
              <Ionicons name="arrow-forward" size={19} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
      <Modal
        visible={guilds.length > 0}
        animationType="slide"
        transparent
        onRequestClose={closeGuildModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("userSettings.selectGuildTitle")}</Text>
            <FlatList
              data={guilds}
              keyExtractor={(item) => item.guildId}
              renderItem={({ item }) => {
                const isSelected = selectedGuildId === item.guildId;
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={isBusy}
                    style={[styles.modalButton, isBusy && styles.disabledButton]}
                    onPress={() => selectGuild(item)}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.flagImage} />
                    ) : (
                      <View style={styles.guildIcon}>
                        <Ionicons name="shield-outline" size={20} color={DarkThemeColors.primary} />
                      </View>
                    )}
                    <Text style={styles.modalButtonText}>{item.guildName}</Text>
                    {isSelected ? (
                      <ActivityIndicator size="small" color={DarkThemeColors.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={DarkThemeColors.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isBusy}
              style={[styles.closeButton, isBusy && styles.disabledButton]}
              onPress={closeGuildModal}
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
    disabledButton: {
      opacity: 0.4,
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
