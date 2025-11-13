// RoleSelectionScreen.js
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useTranslation } from "react-i18next";

const RoleSelectionScreen = ({ navigation, selectedOption, onCountryPress }) => {
  const { t } = useTranslation();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 30,
      color: "#222222",
    },
    button: {
      backgroundColor: "#0088CC",
      paddingHorizontal: 20,
      paddingVertical: 15,
      borderRadius: 5,
      marginBottom: 15,
      alignItems: "center",
      width: Dimensions.get("window").width * 0.65,
    },
    selectedButton: {
      backgroundColor: "#006699",
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "bold",
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("roleSelection.title")}</Text>
      <View style={{ flexDirection: "column", alignItems: "center" }}>
        {/* Кнопка для переходу до налаштувань адміністратора */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("AdminSettingsScreen")}
        >
          <Text style={styles.buttonText}>{t("roleSelection.admin")}</Text>
        </TouchableOpacity>
        {/* Кнопка для переходу до налаштувань звичайного користувача */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("UserSettingsScreen")}
        >
          <Text style={styles.buttonText}>{t("roleSelection.user")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default RoleSelectionScreen;
