import React, { useState, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

import { database } from "../firebaseConfig"; 
import { ref, set, get, update } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CryptoJS from "react-native-crypto-js";
import { GuildContext } from "../GuildContext"; // Скоригуйте шлях, якщо потрібно
import { useTranslation } from "react-i18next";
import { uploadFcmToken } from "../src/notifications/registerToken";

const AdminSelectScreen = ({
  guildData,      // масив даних про учасників гільдії
  clanCaption,    // назва гільдії
  guildId,        // 5-значний ID
  uril,           // частина URL (назва сервера/ріона)
  selectedWorld,  // назва світу
  fetch,          // ← Функція, що прийшла з батьківського компонента
}) => {
  const { t } = useTranslation();
  const [selectedMember, setSelectedMember] = useState(null);
  const [imageLoadingStates, setImageLoadingStates] = useState({});
  // Отримуємо функцію setGuildId з контексту
  const { setGuildId } = useContext(GuildContext);

  const handleItemPress = (item) => {
    setSelectedMember(item);
  };

  const handleConfirm = async () => {
    if (!selectedMember) return;

    // 1. Витягаємо userId з linkUrl
    const selectedUserId = selectedMember.linkUrl.split("/").pop();
    // 2. Формуємо унікальний "guildId" для Firebase
    const formattedGuildId = `${uril}_${guildId}`;

    const guildRef = ref(database, `guilds/${formattedGuildId}`);
    const guildInfo = {
      guildName: clanCaption,
      worldName: selectedWorld,
    };

    try {
      // 3. Записуємо дані гільдії
      await set(guildRef, guildInfo);
      console.log(`Дані гільдії оновлено для id: ${formattedGuildId}`);

      // 4. Оновлюємо / створюємо користувачів у Firebase
      const guildUsersRef = ref(database, `guilds/${formattedGuildId}/guildUsers`);

      await Promise.all(
        guildData.map(async (member) => {
          const userId = member.linkUrl.split("/").pop();
          const imageUrl = `https://foe.scoredb.io${member.imageUrl}`;

          const userGuildData = {
            [formattedGuildId]: {
              imageUrl: imageUrl,
              role: userId === selectedUserId ? "guildLeader" : "member",
            },
          };

          const userGuildUserData = {
            userName: member.name,
            imageUrl: imageUrl,
          };

          // Перевірка, чи існує user у Firebase
          const snapshot = await get(ref(database, `users/${userId}`));
          if (snapshot.exists()) {
            // Якщо існує
            await update(ref(database, `users/${userId}`), userGuildData);
          } else {
            // Якщо не існує
            const userRootRef = ref(database, `users/${userId}`);
            const encryptedUserId = CryptoJS.AES.encrypt(
              userId,
              "your-encryption-key"
            ).toString();
            const userRootData = {
              userName: member.name,
              password: encryptedUserId, // зберігаємо зашифрований userId
              ...userGuildData,
            };

            await set(userRootRef, userRootData);
          }

          // Запис про користувача у розділі guildUsers
          const userGuildUserRef = ref(
            database,
            `guilds/${formattedGuildId}/guildUsers/${userId}`
          );
          await set(userGuildUserRef, userGuildUserData);
        })
      );

      // 5. Зберігаємо у AsyncStorage для швидкого доступу:
      await AsyncStorage.setItem("guildId", formattedGuildId);
      await AsyncStorage.setItem("userId", selectedUserId);
      // Оновлюємо глобальний стан через контекст
      setGuildId(formattedGuildId);
      // 5a. Пуш-токен: якщо він уже кешований — пишемо у БД
      await uploadFcmToken(selectedUserId, database);

      // 6. Викликаємо функцію з батька, якщо вона є:
      if (typeof fetch === "function") {
        fetch(); // викликаємо для перезавантаження даних
      }

      // Закриваємо модальне вікно
      setSelectedMember(null);

    } catch (error) {
      console.error("Помилка при оновленні даних:", error);
    }
  };

  const handleCancel = () => {
    setSelectedMember(null);
  };

  const renderItem = ({ item }) => {
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

      {/* Модальне вікно, якщо користувач обрав одного з учасників */}
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
                  <TouchableOpacity onPress={handleConfirm} style={styles.button}>
                    <Text style={styles.buttonText}>{t("adminSelect.confirmButton")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCancel} style={styles.button}>
                    <Text style={styles.buttonText}>{t("adminSelect.cancelButton")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
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
    backgroundColor: "#64B5F6",
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
    color: "#fff",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
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
  },
  confirmationText: {
    fontSize: 16,
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
  },
  button: {
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
  },
  errorText: {
    textAlign: "center",
    marginVertical: 20,
    color: "red",
  },
});

export default AdminSelectScreen;
