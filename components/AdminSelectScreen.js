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

  const handleItemPress = (item) => {
    setSelectedMember(item);
  };

  const handleConfirm = async () => {
    if (!selectedMember || isCreating) return;

    const selectedUserId = selectedMember.linkUrl.split("/").pop();
    const formattedGuildId = `${uril}_${guildId}`;

    // ИСПРАВЛЕНО: Правильный синтаксис
    const guildRef = database().ref(`guilds/${formattedGuildId}`);
    const guildInfo = {
      guildName: clanCaption,
      worldName: selectedWorld,
      guildUsers: Object.fromEntries(
        guildData.map((member) => {
          const userId = member.linkUrl.split("/").pop();
          return [
            userId,
            {
              userName: member.name,
              imageUrl: `https://foe.scoredb.io${member.imageUrl}`,
            },
          ];
        })
      ),
    };

    try {
      setIsCreating(true);
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
      await guildRef.update(guildUpdates);
      console.log(`Дані гільдії оновлено для id: ${formattedGuildId}`);

      // 4. Оновлюємо / створюємо користувачів у Firebase
      const userAccounts = await Promise.all(
        guildData.map(async (member) => {
          const userId = member.linkUrl.split("/").pop();
          const imageUrl = `https://foe.scoredb.io${member.imageUrl}`;

          const userGuildData = {
            [formattedGuildId]: {
              imageUrl: imageUrl,
              role:
                userId === selectedUserId
                  ? USER_ROLES.GUILD_LEADER
                  : USER_ROLES.MEMBER,
            },
          };

          const userRef = database().ref(`users/${userId}`);
          const snapshot = await userRef.once('value');
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
        t("adminSelect.creationErrorMessage")
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
                    style={styles.button}
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
      borderRadius: 8,
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
