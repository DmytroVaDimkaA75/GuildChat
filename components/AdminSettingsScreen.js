import React, { useState, useEffect } from "react";
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
  Keyboard,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { parseData } from "../parser";
import { parseDataNew } from "../worldParser";
import { parseGuildData } from "../guildParser";
import AdminSelectScreen from "./AdminSelectScreen";

const AdminSettingsScreen = ({ selectedOption, onCountryPress, fetch }) => {
  const { t } = useTranslation();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isWorldModalVisible, setIsWorldModalVisible] = useState(false);
  const [countries, setCountries] = useState([]);
  const [worlds, setWorlds] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [selectedWorld, setSelectedWorld] = useState(null);
  const [guildId, setGuildId] = useState("");
  const [parseError, setParseError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCountryName, setSelectedCountryName] = useState(null);
  const [uril, setUril] = useState("");

  const [isApplyButtonEnabled, setIsApplyButtonEnabled] = useState(false);
  const [showSelectScreen, setShowSelectScreen] = useState(false);
  const [parsedGuildData, setParsedGuildData] = useState(null);
  const [clanCaption, setClanCaption] = useState(null);

  const screenWidth = Dimensions.get("window").width;
  const buttonWidth = screenWidth * 0.8;

  useEffect(() => {
    const withTimeout = (promise, timeout = 7000) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        ),
      ]);
  
    const loadCountries = async () => {
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
  }, []);
  

  useEffect(() => {
    setIsApplyButtonEnabled(guildId.length === 5);
  }, [guildId]);

  const handleOptionPress = (option) => {
    if (option === "server") {
      setIsModalVisible(true);
    } else if (option === "world") {
      setSelectedCountryName(selectedOption);
      setIsWorldModalVisible(true);
      loadWorlds(selectedOption);
    }
  };

  const handleCountryPress = (country) => {
    onCountryPress(country);
    setGuildId("");
    setSelectedWorld(null);
    setIsModalVisible(false);
  };

  const handleServerPress = (server) => {
    setSelectedServer(server);
    setIsModalVisible(false);
  };

  const handleGuildIdChange = (text) => {
    const numericText = text.replace(/[^0-9]/g, "");
    setGuildId(numericText);
  };

  const handleApplyPress = async () => {
    if (isApplyButtonEnabled) {
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
        } else {
          console.log("Получені дані гільдії:", data);
          setParsedGuildData(data);
          setClanCaption(clanCaption);
          setShowSelectScreen(true);
        }
      } else {
        console.error("Помилка парсингу:", result.error);
      }
    } else {
      console.error("Помилка: сервер не вибраний або некоректний ID гільдії");
    }
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
      setWorlds(parsedData);
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
    </TouchableOpacity>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    },
    contentContainer: {},
    button: {
      backgroundColor: "#29ABE2",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 5,
      marginBottom: 10,
      alignItems: "center",
    },
    selectedButton: {
      backgroundColor: "#0088CC",
    },
    disabledButton: {
      backgroundColor: "#B0B0B0",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 5,
      marginBottom: 10,
      alignItems: "center",
    },
    buttonText: {
      color: "white",
      fontSize: 16,
      fontWeight: "500",
    },
    inputContainer: {
      marginBottom: 10,
    },
    inputLabel: {
      fontSize: 16,
      marginBottom: 5,
      color: "#333333",
    },
    input: {
      borderWidth: 1,
      borderColor: "#e0e0e0",
      padding: 10,
      borderRadius: 5,
      backgroundColor: "#f2f2f2",
    },
    placeholderText: {
      color: "#999999",
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
      maxHeight: Dimensions.get("window").height * 0.5,
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
    flagContainer: {
      justifyContent: "flex-start",
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
    errorText: {
      color: "red",
      marginBottom: 10,
    },
  });

  return (
    <View style={styles.container}>
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
          <TouchableOpacity
            style={[
              styles.button,
              selectedOption !== "Сервер" && styles.selectedButton,
              { width: buttonWidth },
            ]}
            onPress={() => handleOptionPress("server")}
          >
            <Text style={styles.buttonText}>{selectedOption}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              selectedOption === "Сервер" && styles.disabledButton,
              { width: buttonWidth },
            ]}
            disabled={selectedOption === "Сервер"}
            onPress={() => handleOptionPress("world")}
          >
            <Text style={styles.buttonText}>
              {selectedWorld || t("adminSettings.defaultWorld")}
            </Text>
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
              keyboardType="numeric"
              maxLength={5}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              { width: buttonWidth },
              !isApplyButtonEnabled && styles.disabledButton,
            ]}
            onPress={handleApplyPress}
            disabled={!isApplyButtonEnabled}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{t("adminSettings.apply")}</Text>
            )}
          </TouchableOpacity>

          <Modal
            visible={isModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setIsModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
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
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity
                  style={[styles.modalButton, { marginBottom: 10 }]}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>
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
                  style={[styles.modalButton, { marginBottom: 10 }]}
                  onPress={() => setIsWorldModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>
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
