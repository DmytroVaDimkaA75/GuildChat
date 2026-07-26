import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
// ИСПРАВЛЕНО: Правильные импорты для Firestore и Auth
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const MenuHeader = () => {
  const [userData, setUserData] = useState(null); // Начальное состояние null

  useEffect(() => {
    // Получаем текущего пользователя
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.log("Пользователь не найден, не могу загрузить данные для хедера");
      return;
    }

    // ИСПРАВЛЕНО: Правильный синтаксис для Firestore
    const userRef = firestore().collection('users').doc(currentUser.uid);

    const unsubscribe = userRef.onSnapshot((doc) => {
      if (doc.exists) {
        setUserData(doc.data());
      } else {
        console.log("Документ пользователя не найден в Firestore!");
      }
    });

    // Отписываемся от слушателя при размонтировании компонента
    return () => unsubscribe();
  }, []);

  // Если данных еще нет, можно показать заглушку
  if (!userData) {
    return (
      <View style={styles.headerContainer}>
        <View style={styles.avatar} />
        <View style={styles.textContainer}>
          <Text style={styles.userName}>Загрузка...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.headerContainer}>
      <Image source={{ uri: userData.userImageUrl }} style={styles.avatar} />
      <View style={styles.textContainer}>
        <Text style={styles.userName}>{userData.userName}</Text>
        <Text style={styles.worldName}>{userData.worldName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#1b1f2a',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ccc', // Цвет-заглушка
  },
  textContainer: {
    marginLeft: 10,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  worldName: {
    fontSize: 14,
    color: '#9aa3b2',
  },
});

export default MenuHeader;
