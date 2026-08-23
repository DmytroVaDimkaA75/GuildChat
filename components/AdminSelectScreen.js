import { useContext, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import CryptoJS from "react-native-crypto-js";
import { GuildContext } from "../GuildContext";
import { USER_ROLES } from "../constants/roles";
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
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAccount, setPendingAccount] = useState(null);
  const { setGuildId } = useContext(GuildContext);

  const getCreationErrorMessage = (error, stage) => {
    const errorCode = String(error?.code || "").trim();
    const errorMessage = String(error?.message || error || "").trim();
    const details = [stage, errorCode, errorMessage].filter(Boolean).join(" · ");

    return details
      ? `${t("adminSelect.creationErrorMessage")}\n\n${details}`
      : t("adminSelect.creationErrorMessage");
  };

  const handleItemPress = (item) => {
    setSelectedMember(item);
  };

  const handleConfirm = async () => {
    if (!selectedMember || isCreating) return;
    let creationStage = "validation";

    try {
      setIsCreating(true);
      const selectedUserId = String(
        selectedMember.linkUrl?.split("/").filter(Boolean).pop() || ""
      ).trim();
      const formattedGuildId = `${uril}_${guildId}`.trim();
      const validMembers = guildData
        .map((member) => ({
          ...member,
          userId: String(
            member.linkUrl?.split("/").filter(Boolean).pop() || ""
          ).trim(),
        }))
        .filter(({ userId }) => userId);

      if (!selectedUserId || !formattedGuildId || validMembers.length === 0) {
        throw new Error("Invalid guild or player data");
      }

      const guildRef = database().ref(`guilds/${formattedGuildId}`);
      const guildInfo = {
        guildName: clanCaption,
        worldName: selectedWorld,
        guildUsers: Object.fromEntries(
          validMembers.map((member) => [
            member.userId,
            {
              userName: member.name,
              imageUrl: member.imageUrl
                ? `https://foe.scoredb.io${member.imageUrl}`
                : "",
            },
          ])
        ),
      };

      creationStage = "read guild settings";
      const gbgGoalSnapshot = await guildRef
        .child("setting/GBGGoal")
        .once("value");
      const guildUpdates = { ...guildInfo };
      if (
        !gbgGoalSnapshot.exists() ||
        typeof gbgGoalSnapshot.val() !== "boolean"
      ) {
        guildUpdates["setting/GBGGoal"] = true;
      }

      // 3. Оновлюємо лише базові дані, не стираючи налаштування та контент гільдії
      creationStage = "write guild";
      await guildRef.update(guildUpdates);
      console.log(`Дані гільдії оновлено для id: ${formattedGuildId}`);

      // 4. Оновлюємо / створюємо користувачів у Firebase
      const userAccounts = await Promise.all(
        validMembers.map(async (member) => {
          const userId = member.userId;
          const imageUrl = member.imageUrl
            ? `https://foe.scoredb.io${member.imageUrl}`
            : "";

          const userGuildData = {
            [`userGuilds/${formattedGuildId}`]: {
              imageUrl: imageUrl,
              role:
                userId === selectedUserId
                  ? USER_ROLES.GUILD_LEADER
                  : USER_ROLES.MEMBER,
            },
          };

          const userRef = database().ref(`users/${userId}`);
          creationStage = `read user ${userId}`;
          const snapshot = await userRef.once("value");
          const existingUser = snapshot.exists() ? snapshot.val() || {} : {};
          const existingAccessCode =
            typeof existingUser.password === "string"
              ? existingUser.password.trim()
              : "";
          const accessCode =
            existingAccessCode ||
            CryptoJS.AES.encrypt(
              userId,
              "your-encryption-key"
            ).toString();

          creationStage = `write user ${userId}`;
          await userRef.update({
            ...(!snapshot.exists() ? { userName: member.name } : {}),
            ...(!existingAccessCode ? { password: accessCode } : {}),
            ...userGuildData,
          });

          return { userId, accessCode };
        })
      );
      const creatorAccount = userAccounts.find(
        ({ userId }) => userId === selectedUserId
      );
      if (!creatorAccount?.accessCode) {
        throw new Error("Не вдалося створити код доступу власника гільдії");
      }

      console.log("Запрашиваю FCM токен і кешую перед збереженням облікового запису...");
      creationStage = "notifications";
      await cachePushToken();
      await uploadPushToken(selectedUserId);

      setSelectedMember(null);
      setPendingAccount({
        accessCode: creatorAccount.accessCode,
        guildId: formattedGuildId,
        userId: selectedUserId,
      });
    } catch (error) {
      console.error("Помилка при оновленні даних:", error);
      Alert.alert(
        t("adminSelect.creationErrorTitle"),
        getCreationErrorMessage(error, creationStage)
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    if (isCreating) return;
    setSelectedMember(null);
  };

  const handleCopyAccessCode = async () => {
    if (!pendingAccount?.accessCode) return;
    try {
      await Clipboard.setStringAsync(pendingAccount.accessCode);
      Alert.alert(
        t("adminSelect.accessCodeCopiedTitle"),
        t("adminSelect.accessCodeCopiedMessage")
      );
    } catch (error) {
      console.error("Не вдалося скопіювати код доступу:", error);
      Alert.alert(
        t("adminSelect.creationErrorTitle"),
        t("adminSelect.copyAccessCodeError")
      );
    }
  };

  const handleContinue = async () => {
    if (!pendingAccount || isCreating) return;
    setIsCreating(true);
    const account = pendingAccount;
    try {
      await AsyncStorage.multiSet([
        ["guildId", account.guildId],
        ["userId", account.userId],
      ]);
      setPendingAccount(null);
      setIsCreating(false);
      setGuildId(account.guildId);
      if (typeof fetch === "function") {
        Promise.resolve(fetch(account.guildId)).catch((error) => {
          console.error("Не вдалося оновити стан облікового запису:", error);
        });
      }
    } catch (error) {
      console.error("Не вдалося завершити створення облікового запису:", error);
      Alert.alert(
        t("adminSelect.creationErrorTitle"),
        t("adminSelect.creationErrorMessage")
      );
      setIsCreating(false);
    }
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
      <Text style={styles.subtitle}>Оберіть свій профіль, щоб завершити створення гільдії</Text>
      <FlatList
        data={guildData}
        renderItem={renderItem}
        keyExtractor={(item) => item.name}
        ListEmptyComponent={
          <Text style={styles.errorText}>
            {t("adminSelect.emptyMessage")}
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />

      <Modal
        visible={selectedMember !== null}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
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
                  <TouchableOpacity
                    disabled={isCreating}
                    onPress={handleConfirm}
                    style={styles.button}
                  >
                    {isCreating ? (
                      <ActivityIndicator color={DarkThemeColors.text} />
                    ) : (
                      <Text style={styles.buttonText}>
                        {t("adminSelect.confirmButton")}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={isCreating}
                    onPress={handleCancel}
                    style={[styles.button, styles.secondaryButton]}
                  >
                    <Text style={styles.buttonText}>{t("adminSelect.cancelButton")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(pendingAccount)}
        animationType="fade"
        transparent
        onRequestClose={() => {}}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.accessCodeModal]}>
            <View style={styles.modalHandle} />
            <Text style={styles.accessCodeTitle}>
              {t("adminSelect.accessCodeTitle")}
            </Text>
            <Text style={styles.accessCodeMessage}>
              {t("adminSelect.accessCodeMessage")}
            </Text>
            <Text style={styles.accessCodeLabel}>
              {t("adminSelect.accessCodeLabel")}
            </Text>
            <Text selectable style={styles.accessCode}>
              {pendingAccount?.accessCode}
            </Text>
            <TouchableOpacity
              onPress={handleCopyAccessCode}
              style={[styles.button, styles.accessCodeButton]}
            >
              <Text style={styles.buttonText}>
                {t("adminSelect.copyAccessCode")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isCreating}
              onPress={handleContinue}
              style={[styles.button, styles.accessCodeButton]}
            >
              {isCreating ? (
                <ActivityIndicator color={DarkThemeColors.text} />
              ) : (
                <Text style={styles.buttonText}>
                  {t("adminSelect.continueButton")}
                </Text>
              )}
            </TouchableOpacity>
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
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 6,
      color: DarkThemeColors.text,
    },
    subtitle: { color: DarkThemeColors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 18 },
    listContent: { paddingBottom: 20 },
    itemButton: {
      marginBottom: 8,
    },
    itemContainer: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 68,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: DarkThemeColors.surface,
      borderColor: DarkThemeColors.border,
      borderWidth: 1,
    },
    imageContainer: {
      width: 46,
      height: 46,
      borderRadius: 23,
      overflow: "hidden",
      marginRight: 15,
    },
    image: {
      width: "100%",
      height: "100%",
    },
    name: {
      fontSize: 16,
      fontWeight: "700",
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
      borderRadius: 20,
      alignItems: "center",
      width: "88%",
      maxWidth: 420,
    },
    modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: DarkThemeColors.border, alignSelf: "center", marginBottom: 18 },
    accessCodeModal: {
      width: "90%",
      maxWidth: 440,
    },
    accessCodeTitle: {
      color: DarkThemeColors.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 12,
      textAlign: "center",
    },
    accessCodeMessage: {
      color: DarkThemeColors.textSecondary,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 16,
      textAlign: "center",
    },
    accessCodeLabel: {
      alignSelf: "flex-start",
      color: DarkThemeColors.textSecondary,
      fontSize: 13,
      marginBottom: 6,
    },
    accessCode: {
      alignSelf: "stretch",
      backgroundColor: DarkThemeColors.surfaceElevated,
      borderColor: DarkThemeColors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: DarkThemeColors.text,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
      padding: 12,
      textAlign: "center",
    },
    accessCodeButton: {
      alignSelf: "stretch",
      marginBottom: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    modalImage: {
      width: 88,
      height: 88,
      marginBottom: 12,
      borderRadius: 44,
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
      justifyContent: "center",
      marginTop: 20,
      alignSelf: "stretch",
    },
    button: {
      backgroundColor: DarkThemeColors.primary,
      minHeight: 46,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },
    secondaryButton: { backgroundColor: DarkThemeColors.surfaceElevated, borderWidth: 1, borderColor: DarkThemeColors.border },
    buttonText: {
      color: DarkThemeColors.text,
      textAlign: "center",
      fontWeight: "800",
    },
    errorText: {
      textAlign: "center",
      marginVertical: 20,
      color: "red",
    },
  });

export default AdminSelectScreen;
