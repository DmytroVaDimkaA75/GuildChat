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
import { DarkThemeColors } from "../constants/theme";

const RoleSelectionScreen = ({ navigation, selectedOption, onCountryPress }) => {
  const { t } = useTranslation();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: DarkThemeColors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 30,
      color: DarkThemeColors.text,
    },
    button: {
      backgroundColor: DarkThemeColors.primary,
      paddingHorizontal: 20,
      paddingVertical: 15,
      borderRadius: 8,
      marginBottom: 15,
      alignItems: "center",
      width: Dimensions.get("window").width * 0.65,
    },
    selectedButton: {
      backgroundColor: DarkThemeColors.surfaceElevated,
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
