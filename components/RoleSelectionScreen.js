import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DarkThemeColors } from "../constants/theme";
import {
  discardAuthenticatedSession,
  isGoogleAuthCancellation,
  signInWithGoogleAccount,
} from "../src/auth/googleAuth";
import { loadGuildsForUser } from "../src/auth/userGuilds";

const createSessionError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const RoleSelectionScreen = ({ navigation, onCompleteAppSession }) => {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);
  const [guilds, setGuilds] = useState([]);
  const [pendingUserId, setPendingUserId] = useState("");
  const [selectedGuildId, setSelectedGuildId] = useState("");

  const showGoogleError = (error) => {
    const code = String(error?.code || "");
    if (isGoogleAuthCancellation(error)) return;

    if (code === "google/not-linked") {
      Alert.alert(
        t("googleAuth.notLinkedTitle"),
        t("googleAuth.notLinkedMessage")
      );
      return;
    }

    if (code === "google/configuration-missing") {
      Alert.alert(
        t("googleAuth.configurationMissingTitle"),
        t("googleAuth.configurationMissingMessage")
      );
      return;
    }

    console.error("Помилка входу через Google:", code || "unknown");
    Alert.alert(t("googleAuth.errorTitle"), t("googleAuth.errorMessage"));
  };

  const completeSession = async (userId, guildId) => {
    if (typeof onCompleteAppSession !== "function") {
      throw createSessionError(
        "google/configuration-missing",
        "Session completion is unavailable"
      );
    }
    await onCompleteAppSession({ userId, guildId });
  };

  const handleGooglePress = async () => {
    if (isBusy) return;
    setIsBusy(true);
    let hasAuthenticatedSession = false;

    try {
      const result = await signInWithGoogleAccount();
      hasAuthenticatedSession = true;
      const userId = String(result?.userId || "").trim();
      if (!userId) {
        throw createSessionError(
          "google/not-linked",
          "Google account is not linked"
        );
      }

      const availableGuilds = await loadGuildsForUser(userId);
      if (availableGuilds.length === 0) {
        await discardAuthenticatedSession({ clearGoogleSession: true });
        hasAuthenticatedSession = false;
        Alert.alert(
          t("userSettings.noGuildsTitle"),
          t("userSettings.noGuildsMessage")
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
        await discardAuthenticatedSession({ clearGoogleSession: true });
      }
      showGoogleError(error);
    } finally {
      setIsBusy(false);
    }
  };

  const handleGuildPress = async (guild) => {
    if (isBusy || !pendingUserId || !guild?.guildId) return;
    setIsBusy(true);
    setSelectedGuildId(guild.guildId);

    try {
      await completeSession(pendingUserId, guild.guildId);
      setGuilds([]);
      setPendingUserId("");
    } catch (error) {
      await discardAuthenticatedSession({ clearGoogleSession: true });
      setGuilds([]);
      setPendingUserId("");
      showGoogleError(error);
    } finally {
      setSelectedGuildId("");
      setIsBusy(false);
    }
  };

  const closeGuildModal = async () => {
    if (isBusy) return;
    setIsBusy(true);
    await discardAuthenticatedSession({ clearGoogleSession: true });
    setGuilds([]);
    setPendingUserId("");
    setIsBusy(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="people-outline" size={30} color={DarkThemeColors.primary} />
        </View>
        <Text style={styles.title}>{t("roleSelection.title")}</Text>
        <Text style={styles.subtitle}>Оберіть спосіб підключення до гільдії</Text>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          disabled={isBusy}
          style={[styles.button, isBusy && styles.disabledButton]}
          onPress={() => navigation.navigate("AdminSettingsScreen")}
        >
          <View style={styles.buttonIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color={DarkThemeColors.primary} />
          </View>
          <Text style={styles.buttonText}>{t("roleSelection.admin")}</Text>
          <Ionicons name="chevron-forward" size={21} color={DarkThemeColors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          disabled={isBusy}
          style={[styles.button, isBusy && styles.disabledButton]}
          onPress={() => navigation.navigate("UserSettingsScreen")}
        >
          <View style={styles.buttonIcon}>
            <Ionicons name="key-outline" size={22} color={DarkThemeColors.primary} />
          </View>
          <Text style={styles.buttonText}>{t("roleSelection.user")}</Text>
          <Ionicons name="chevron-forward" size={21} color={DarkThemeColors.textSecondary} />
        </TouchableOpacity>
        {Platform.OS === "android" && (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            disabled={isBusy}
            style={[styles.button, styles.googleButton, isBusy && styles.disabledButton]}
            onPress={handleGooglePress}
          >
            <View style={styles.buttonIcon}>
              {isBusy ? (
                <ActivityIndicator size="small" color={DarkThemeColors.primary} />
              ) : (
                <Ionicons name="logo-google" size={22} color={DarkThemeColors.primary} />
              )}
            </View>
            <Text style={styles.buttonText}>{t("googleAuth.signIn")}</Text>
            {!isBusy && (
              <Ionicons name="chevron-forward" size={21} color={DarkThemeColors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
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
            <Text style={styles.modalTitle}>
              {t("userSettings.selectGuildTitle")}
            </Text>
            <FlatList
              data={guilds}
              keyExtractor={(item) => item.guildId}
              renderItem={({ item }) => {
                const isSelected = selectedGuildId === item.guildId;
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.8}
                    disabled={isBusy}
                    style={[styles.modalButton, isBusy && styles.disabledButton]}
                    onPress={() => handleGuildPress(item)}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.guildImage} />
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
    backgroundColor: DarkThemeColors.background,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: DarkThemeColors.surface,
    borderColor: DarkThemeColors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: DarkThemeColors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
    color: DarkThemeColors.text,
  },
  subtitle: {
    color: DarkThemeColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 22,
  },
  button: {
    minHeight: 62,
    backgroundColor: DarkThemeColors.surfaceElevated,
    paddingHorizontal: 15,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
  },
  googleButton: {
    marginBottom: 0,
  },
  disabledButton: {
    opacity: 0.4,
  },
  buttonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: DarkThemeColors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  buttonText: {
    color: DarkThemeColors.text,
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
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
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: DarkThemeColors.border,
    alignSelf: "center",
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
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
  guildImage: {
    width: 40,
    height: 40,
    borderRadius: 12,
    marginRight: 12,
  },
  guildIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DarkThemeColors.background,
  },
  closeButton: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  closeButtonText: {
    color: DarkThemeColors.primarySoft,
    fontSize: 15,
    fontWeight: "800",
  },
});

export default RoleSelectionScreen;
