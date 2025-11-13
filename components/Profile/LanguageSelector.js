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
      <ScrollView>
        {supportedLanguages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={styles.languageOption}
            onPress={() => handleLanguageChange(lang.code)}
          >
            <Text style={styles.languageText}>{lang.label}</Text>
            {selectedLanguage === lang.code && (
              <Ionicons name="checkmark" size={24} color="#0088CC" />
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
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#222222",
  },
  languageOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  languageText: {
    fontSize: 16,
    color: "#333333",
  },
});