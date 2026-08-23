// RoleSelectionScreen.js
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { DarkThemeColors } from "../constants/theme";

const RoleSelectionScreen = ({ navigation, selectedOption, onCountryPress }) => {
  const { t } = useTranslation();

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
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="people-outline" size={30} color={DarkThemeColors.primary} />
        </View>
        <Text style={styles.title}>{t("roleSelection.title")}</Text>
        <Text style={styles.subtitle}>Оберіть спосіб підключення до гільдії</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.button}
          onPress={() => navigation.navigate("AdminSettingsScreen")}
        >
          <View style={styles.buttonIcon}><Ionicons name="shield-checkmark-outline" size={22} color={DarkThemeColors.primary} /></View>
          <Text style={styles.buttonText}>{t("roleSelection.admin")}</Text>
          <Ionicons name="chevron-forward" size={21} color={DarkThemeColors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.button}
          onPress={() => navigation.navigate("UserSettingsScreen")}
        >
          <View style={styles.buttonIcon}><Ionicons name="key-outline" size={22} color={DarkThemeColors.primary} /></View>
          <Text style={styles.buttonText}>{t("roleSelection.user")}</Text>
          <Ionicons name="chevron-forward" size={21} color={DarkThemeColors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default RoleSelectionScreen;
