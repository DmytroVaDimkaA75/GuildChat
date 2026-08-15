import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ИЗМЕНЕНО
import { useNavigation, useRoute } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import i18n from "../../i18n";

console.log("i18n:", i18n);

const supportedLanguages = [
  { code: "uk", label: "Українська" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "be", label: "Беларуская" },
  { code: "de", label: "Deutsch" },
  // Додайте інші мови за потреби
];

const LanguageSelector = () => {
  const navigation = useNavigation();
  const route = useRoute();

  // Початково беремо поточну мову з i18n
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);

  useEffect(() => {
    // Завантажуємо мову з AsyncStorage, щоб відобразити її виділеною, якщо вона там є
    const loadLanguage = async () => {
      const storedLang = await AsyncStorage.getItem("userLanguage");
      if (storedLang) {
        setSelectedLanguage(storedLang);
      }
    };
    loadLanguage();
  }, []);

  useEffect(() => {
    // Щоразу, як змінюється локальний selectedLanguage,
    // оновлюємо параметри роута (щоб headerRight "бачив" вибір)
    navigation.setParams({ selectedLanguage });
  }, [selectedLanguage]);

  // Передаємо saveLanguage у route.params для доступу з хедера
  React.useEffect(() => {
    navigation.setParams({ selectedLanguage, saveLanguage });
  }, [selectedLanguage]);

  const handleLanguageChange = (langCode) => {
    setSelectedLanguage(langCode);
    // Тут ми НЕ змінюємо AsyncStorage і НЕ викликаємо i18n.changeLanguage,
    // бо чекаємо на фінальне "підтвердження" через галочку.
  };

  // Додаємо функцію для збереження мови в AsyncStorage і БД
  const saveLanguage = async (langCode) => {
    await AsyncStorage.setItem("userLanguage", langCode);
    // Зберігаємо також у Realtime Database
    const userId = await AsyncStorage.getItem("userId");
    if (userId) {
      // ИЗМЕНЕНО
      await database()
        .ref(`users/${userId}/setting/language`)
        .set(langCode);
    }
    i18n.changeLanguage(langCode);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Мова</Text>
      <ScrollView contentContainerStyle={styles.listContent}>
        {supportedLanguages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.languageOption, selectedLanguage === lang.code && styles.languageOptionActive]}
            onPress={() => handleLanguageChange(lang.code)}
          >
            <Text style={styles.languageText}>{lang.label}</Text>
            {selectedLanguage === lang.code && (
              <Ionicons name="checkmark" size={22} color="#4ea1ff" />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default LanguageSelector;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1115",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    color: "#f4f7fb",
  },
  listContent: {
    paddingBottom: 16,
  },
  languageOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#152330",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  languageOptionActive: {
    borderColor: "#4ea1ff",
    backgroundColor: "rgba(52,152,219,0.1)",
  },
  languageText: {
    fontSize: 16,
    color: "#f4f7fb",
  },
});
