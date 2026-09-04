import React, { useContext, useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import database from "@react-native-firebase/database";
import CryptoJS from "react-native-crypto-js";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
  BackHandler,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { parseData } from "../parser";
import { parseDataNew } from "../worldParser";
import { parseGuildData } from "../guildParser";
import { DarkThemeColors } from "../constants/theme";
import { USER_ROLES } from "../constants/roles";
import { GuildContext } from "../GuildContext";
import AdminSelectScreen from "./AdminSelectScreen";

const WORLD_COUNTRIES = {
  de: { sourceName: "Deutschland", displayName: "Німеччина" },
  en: { sourceName: "International", displayName: "Міжнародний" },
  es: { sourceName: "España", displayName: "Іспанія" },
  fr: { sourceName: "France", displayName: "Франція" },
  it: { sourceName: "Italia", displayName: "Італія" },
  nl: { sourceName: "Nederland", displayName: "Нідерланди" },
  pl: { sourceName: "Polska", displayName: "Польща" },
  pt: { sourceName: "Portugal", displayName: "Португалія" },
  ru: { sourceName: "Россия", displayName: "Росія" },
  us: { sourceName: "USA", displayName: "США" },
};

const AdminSettingsScreen = ({
  selectedOption,
  onCountryPress,
  fetch,
  navigation,
  addWorldMode = false,
  onBeforeGuildSwitch,
}) => {
  const { t } = useTranslation();
  const { setGuildId: setActiveGuildId } = useContext(GuildContext);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isWorldModalVisible, setIsWorldModalVisible] = useState(false);
  const [countries, setCountries] = useState([]);
  const [worlds, setWorlds] = useState([]);
  const [selectedWorld, setSelectedWorld] = useState(null);
  const [guildId, setGuildId] = useState("");
  const [parseError, setParseError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uril, setUril] = useState("");
  const [lockedCountry, setLockedCountry] = useState(null);
  const [currentWorldId, setCurrentWorldId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isApplyButtonEnabled, setIsApplyButtonEnabled] = useState(false);
  const [showSelectScreen, setShowSelectScreen] = useState(false);
  const [parsedGuildData, setParsedGuildData] = useState(null);
  const [clanCaption, setClanCaption] = useState(null);

  const buttonWidth = "100%";

  const closeScreen = React.useCallback(() => {
    if (isSubmitting) return;
    if (addWorldMode) {
      navigation?.reset({ index: 0, routes: [{ name: "GBG" }] });
    } else {
      navigation?.goBack();
    }
  }, [addWorldMode, isSubmitting, navigation]);

  useFocusEffect(
    React.useCallback(() => {
      if (!addWorldMode) return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        closeScreen();
        return true;
      });
      return () => subscription.remove();
    }, [addWorldMode, closeScreen])
  );

  useEffect(() => {
    const withTimeout = (promise, timeout = 7000) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        ),
      ]);
  
    const loadCountries = async () => {
      if (addWorldMode) return;
      setIsLoading(true);
      try {
        const parsedData = await withTimeout(parseData(), 7000); // 7 секунд
        setCountries(parsedData);
      } catch (error) {
        if (error.message === "Timeout") {
          setParseError(t("adminSettings.timeoutError") || "Перевищено час очікування.");
        } else {
          setParseError(error.message);
        }
      } finally {
        setIsLoading(false);
      }
    };
  
    loadCountries();
  }, [addWorldMode, t]);

  useEffect(() => {
    if (!addWorldMode) return;
    let active = true;
    (async () => {
      const [storedGuildId, storedUserId] = await Promise.all([
        AsyncStorage.getItem("guildId"),
        AsyncStorage.getItem("userId"),
      ]);
      if (!active) return;
      const worldId = String(storedGuildId || "").split("_")[0].toLowerCase();
      const countryCode = worldId.match(/^[a-z]+/)?.[0] || "";
      const country = WORLD_COUNTRIES[countryCode];
      setCurrentWorldId(worldId);
      setCurrentUserId(String(storedUserId || ""));
      setLockedCountry(country || null);
      if (!country) {
        setParseError("Не вдалося визначити сервер поточної гільдії.");
      }
    })().catch((error) => setParseError(error.message));
    return () => { active = false; };
  }, [addWorldMode]);
  

  useEffect(() => {
    setIsApplyButtonEnabled(guildId.length === 5 && Boolean(selectedWorld));
  }, [guildId, selectedWorld]);

  const handleOptionPress = (option) => {
    if (option === "server") {
      setIsModalVisible(true);
    } else if (option === "world") {
      setIsWorldModalVisible(true);
      loadWorlds(addWorldMode ? lockedCountry?.sourceName : selectedOption);
    }
  };

  const handleCountryPress = (country) => {
    onCountryPress(country);
    setGuildId("");
    setSelectedWorld(null);
    setIsModalVisible(false);
  };

  const handleGuildIdChange = (text) => {
    const numericText = text.replace(/[^0-9]/g, "");
    setGuildId(numericText);
  };

  const handleApplyPress = async () => {
    if (isApplyButtonEnabled) {
      setIsSubmitting(true);
      try {
        if (!addWorldMode) {
          const existingGuildSnapshot = await database()
            .ref(`guilds/${uril}_${guildId}`)
            .once("value");
          if (existingGuildSnapshot.exists()) {
            Alert.alert(
              t("adminSettings.guildExistsTitle"),
              t("adminSettings.guildExistsMessage", { guildId }),
              [{ text: t("adminSettings.ok") }]
            );
            return;
          }
        }

        const newUril = `https://foe.scoredb.io/${uril}/Guild/${guildId}/Activity`;
        const result = await parseGuildData(newUril);

        if (result.success) {
          const { data, clanCaption } = result;

          if (data.length === 0) {
            Alert.alert(
              t("adminSettings.guildNotFoundTitle"),
              t("adminSettings.guildNotFoundMessage", { guildId }),
              [{ text: t("adminSettings.ok") }]
            );
          } else if (addWorldMode) {
            await createAdditionalGuild({ data, clanCaption });
          } else {
            setParsedGuildData(data);
            setClanCaption(clanCaption);
            setShowSelectScreen(true);
          }
        } else {
          Alert.alert("Помилка", result.error || "Не вдалося отримати дані гільдії.");
        }
      } catch (error) {
        console.error("Помилка створення гільдії:", error);
        Alert.alert("Помилка", error.message || "Не вдалося створити гільдію.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      console.error("Помилка: сервер не вибраний або некоректний ID гільдії");
    }
  };

  const createAdditionalGuild = async ({ data, clanCaption: newGuildName }) => {
    if (!currentUserId) throw new Error("Не знайдено поточного користувача.");
    const formattedGuildId = `${uril}_${guildId}`;
    const validMembers = data
      .map((member) => ({
        ...member,
        userId: String(member.linkUrl?.split("/").filter(Boolean).pop() || "").trim(),
      }))
      .filter((member) => member.userId);
    const currentMember = validMembers.find((member) => member.userId === currentUserId);
    if (!currentMember) {
      Alert.alert("Акаунт не знайдено", "Ваш поточний акаунт не входить до складу цієї гільдії.");
      return;
    }

    const guildRef = database().ref(`guilds/${formattedGuildId}`);
    const goalSnapshot = await guildRef.child("setting/GBGGoal").once("value");
    const guildUpdates = {
      guildName: newGuildName,
      worldName: selectedWorld,
      guildUsers: Object.fromEntries(validMembers.map((member) => [
        member.userId,
        {
          userName: member.name,
          imageUrl: member.imageUrl ? `https://foe.scoredb.io${member.imageUrl}` : "",
        },
      ])),
    };
    if (!goalSnapshot.exists() || typeof goalSnapshot.val() !== "boolean") {
      guildUpdates["setting/GBGGoal"] = true;
    }
    await guildRef.update(guildUpdates);

    await Promise.all(validMembers.map(async (member) => {
      const imageUrl = member.imageUrl ? `https://foe.scoredb.io${member.imageUrl}` : "";
      const userRef = database().ref(`users/${member.userId}`);
      const userSnapshot = await userRef.once("value");
      const userData = {
        [`userGuilds/${formattedGuildId}`]: {
          imageUrl,
          role: member.userId === currentUserId ? USER_ROLES.GUILD_LEADER : USER_ROLES.MEMBER,
        },
      };
      if (!userSnapshot.exists()) {
        userData.userName = member.name;
        userData.password = CryptoJS.AES.encrypt(member.userId, "your-encryption-key").toString();
      }
      await userRef.update(userData);
    }));

    await onBeforeGuildSwitch?.();
    await AsyncStorage.setItem("guildId", formattedGuildId);
    setActiveGuildId(formattedGuildId);
    if (typeof fetch === "function") await fetch(formattedGuildId);
  };

  const handleWorldPress = (world) => {
    setUril(world.url);
    setSelectedWorld(world.name);
    setIsWorldModalVisible(false);
  };

  const loadWorlds = async (countryName) => {
    setIsLoading(true);
    try {
      const parsedData = await parseDataNew(countryName);
      setWorlds(parsedData.filter((world) => world.url.toLowerCase() !== currentWorldId));
    } catch (error) {
      setParseError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderWorldItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.modalButton, { marginBottom: 10 }]}
      onPress={() => handleWorldPress(item)}
    >
      <Text style={styles.modalButtonText}>
        {item.name} ({item.url.substring(item.url.lastIndexOf("/") + 1)})
      </Text>
      <Ionicons name="chevron-forward" size={20} color={DarkThemeColors.textSecondary} />
    </TouchableOpacity>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: DarkThemeColors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    contentContainer: { width: "100%", maxWidth: 460 },
    formCard: { backgroundColor: DarkThemeColors.surface, borderWidth: 1, borderColor: DarkThemeColors.border, borderRadius: 22, padding: 18 },
    screenHeader: { alignItems: "center", marginBottom: 20 },
    headerIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: DarkThemeColors.surfaceElevated, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    title: { color: DarkThemeColors.text, fontSize: 23, fontWeight: "800", textAlign: "center" },
    subtitle: { color: DarkThemeColors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },
    backButton: { position: "absolute", top: 18, left: 18, zIndex: 5, width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: DarkThemeColors.surface, borderWidth: 1, borderColor: DarkThemeColors.border },
    button: {
      minHeight: 52,
      backgroundColor: DarkThemeColors.surfaceElevated,
      paddingHorizontal: 14,
      borderRadius: 13,
      marginBottom: 11,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      borderWidth: 1,
      borderColor: DarkThemeColors.border,
    },
    selectedButton: {
      borderColor: DarkThemeColors.primary,
    },
    disabledButton: {
      opacity: 0.42,
    },
    lockedButton: { opacity: 0.72 },
    buttonText: {
      color: DarkThemeColors.text,
      fontSize: 16,
      fontWeight: "700",
      flex: 1,
      textAlign: "left",
    },
    inputContainer: {
      marginBottom: 11,
      width: "100%",
    },
    inputLabel: {
      fontSize: 16,
      marginBottom: 5,
      color: DarkThemeColors.text,
    },
    input: {
      borderWidth: 1,
      borderColor: DarkThemeColors.border,
      minHeight: 52,
      paddingHorizontal: 14,
      borderRadius: 13,
      backgroundColor: DarkThemeColors.background,
      color: DarkThemeColors.text,
    },
    placeholderText: {
      color: DarkThemeColors.textSecondary,
    },
    modalContainer: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: DarkThemeColors.overlay,
    },
    modalContent: {
      backgroundColor: DarkThemeColors.surface,
      padding: 18,
      paddingTop: 10,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: DarkThemeColors.border,
      maxHeight: Dimensions.get("window").height * 0.68,
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
      marginBottom: 9,
      borderColor: DarkThemeColors.border,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    flagContainer: {
      justifyContent: "flex-start",
    },
    modalButtonText: {
      color: DarkThemeColors.text,
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "left",
      flex: 1,
    },
    flagImage: {
      width: 40,
      height: 30,
      borderRadius: 6,
      marginRight: 12,
    },
    errorText: {
      color: DarkThemeColors.danger,
      marginBottom: 10,
    },
    primaryButton: { backgroundColor: DarkThemeColors.primary, borderColor: DarkThemeColors.primary },
    primaryButtonText: { color: "#fff", textAlign: "center" },
    closeButton: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: DarkThemeColors.border, alignItems: "center", justifyContent: "center", marginTop: 4 },
    closeButtonText: { color: DarkThemeColors.primarySoft, fontSize: 15, fontWeight: "800" },
  });

  return (
    <View style={styles.container}>
      {!showSelectScreen && <TouchableOpacity activeOpacity={0.8} disabled={isSubmitting} onPress={closeScreen} style={[styles.backButton, isSubmitting && styles.disabledButton]}><Ionicons name={addWorldMode ? "close" : "arrow-back"} size={22} color={DarkThemeColors.text} /></TouchableOpacity>}
      {showSelectScreen ? (
        <AdminSelectScreen
          guildData={parsedGuildData}
          clanCaption={clanCaption}
          uril={uril}
          guildId={guildId}
          selectedWorld={selectedWorld}
          fetch={fetch}
        />
      ) : (
        <View style={styles.contentContainer}>
          <View style={styles.screenHeader}>
            <View style={styles.headerIcon}><Ionicons name="shield-checkmark-outline" size={29} color={DarkThemeColors.primary} /></View>
            <Text style={styles.title}>{addWorldMode ? "Додати світ" : "Створення гільдії"}</Text>
            <Text style={styles.subtitle}>
              {addWorldMode
                ? "Оберіть новий світ і введіть ID гільдії"
                : "Оберіть сервер і світ, потім введіть ID гільдії"}
            </Text>
          </View>
          <View style={styles.formCard}>
          <TouchableOpacity
            style={[
              styles.button,
              selectedOption !== "Сервер" && styles.selectedButton,
              addWorldMode && styles.lockedButton,
              { width: buttonWidth },
            ]}
            disabled={addWorldMode}
            onPress={() => handleOptionPress("server")}
          >
            <Text style={styles.buttonText}>
              {addWorldMode ? (lockedCountry?.displayName || "Сервер") : selectedOption}
            </Text>
            <Ionicons name={addWorldMode ? "lock-closed-outline" : "chevron-down"} size={20} color={DarkThemeColors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              ((!addWorldMode && selectedOption === "Сервер") || !lockedCountry && addWorldMode) && styles.disabledButton,
              { width: buttonWidth },
            ]}
            disabled={(!addWorldMode && selectedOption === "Сервер") || (addWorldMode && !lockedCountry)}
            onPress={() => handleOptionPress("world")}
          >
            <Text style={styles.buttonText}>
              {selectedWorld || t("adminSettings.defaultWorld")}
            </Text>
            <Ionicons name="chevron-down" size={20} color={DarkThemeColors.textSecondary} />
          </TouchableOpacity>

          {parseError && <Text style={styles.errorText}>{parseError}</Text>}

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                guildId.length > 0 ? null : styles.placeholderText,
              ]}
              onChangeText={handleGuildIdChange}
              value={guildId}
              placeholder={t("adminSettings.guildIdPlaceholder")}
              placeholderTextColor={DarkThemeColors.textSecondary}
              keyboardType="numeric"
              maxLength={5}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              styles.primaryButton,
              { width: buttonWidth },
              !isApplyButtonEnabled && styles.disabledButton,
            ]}
            onPress={handleApplyPress}
            disabled={!isApplyButtonEnabled || isSubmitting}
          >
            {isLoading || isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={[styles.buttonText, styles.primaryButtonText]}>{t("adminSettings.apply")}</Text>
            )}
          </TouchableOpacity>
          </View>

          <Modal
            visible={isModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setIsModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  {t("adminSettings.selectServerTitle")}
                </Text>
                <FlatList
                  data={countries}
                  keyExtractor={(item) => item.name}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalButton, { marginBottom: 10 }]}
                      onPress={() => handleCountryPress(item)}
                    >
                      <Image
                        source={{ uri: item.flag }}
                        style={styles.flagImage}
                      />
                      <Text style={styles.modalButtonText}>{item.name}</Text>
                      <Ionicons name="chevron-forward" size={20} color={DarkThemeColors.textSecondary} />
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>
                    {t("adminSettings.close")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={isWorldModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setIsWorldModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  {t("adminSettings.selectWorldTitle")}
                </Text>
                {isLoading ? (
                  <ActivityIndicator color="#29ABE2" />
                ) : (
                  <FlatList
                    data={worlds}
                    keyExtractor={(item) => item.name}
                    renderItem={renderWorldItem}
                  />
                )}
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setIsWorldModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>
                    {t("adminSettings.close")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      )}
    </View>
  );
};

export default AdminSettingsScreen;
