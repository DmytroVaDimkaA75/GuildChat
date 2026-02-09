import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import database from '@react-native-firebase/database';

const AddGBComponent = () => {
  const { t, i18n } = useTranslation();
  const [availableGBs, setAvailableGBs] = useState([]);
  const [userGBs, setUserGBs] = useState([]);
  const [guildId, setGuildId] = useState(null);
  const [userId, setUserId] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchIds = async () => {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      setGuildId(guildId);
      setUserId(userId);
    };
    fetchIds();
  }, []);

  useEffect(() => {
    if (!guildId || !userId) return undefined;

    const allGBRef = database().ref('greatBuildings');
    const handleAllGBs = (snapshot) => {
      const allGBs = [];
      snapshot.forEach((childSnapshot) => {
        const id = childSnapshot.key;
        const data = childSnapshot.val();
        // data.buildingName може бути об'єктом з перекладами
        allGBs.push({ id, name: data.buildingName, image: data.buildingImage });
      });
      setAvailableGBs(allGBs);
    };
    allGBRef.on('value', handleAllGBs);

    const userGBRef = database().ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild`);
    const handleUserGBs = (snapshot) => {
      const nextUserGBs = [];
      snapshot.forEach((childSnapshot) => {
        nextUserGBs.push(childSnapshot.key);
      });
      setUserGBs(nextUserGBs);
    };
    userGBRef.on('value', handleUserGBs);

    return () => {
      allGBRef.off('value', handleAllGBs);
      userGBRef.off('value', handleUserGBs);
    };
  }, [guildId, userId]);

  const filteredGBs = availableGBs.filter((gb) => !userGBs.includes(gb.id));

  const handlePress = (id) => {
    const gbRef = database().ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${id}`);
    gbRef
      .set({ level: 1 })
      .then(() => {
        navigation.goBack(); // <-- замість replace('MyGB')
      })
      .catch((error) => {
        console.error(t("addGBComponent.addError"), error);
      });
  };

  // Функція для отримання локалізованої назви ВС, якщо name є об'єктом
  const getLocalizedName = (name) => {
    if (name && typeof name === 'object') {
      return name[i18n.language] || name['uk'] || '';
    }
    return name;
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handlePress(item.id)}>
      <View style={styles.gbItem}>
        <Image source={{ uri: item.image }} style={styles.gbImage} />
        <Text style={styles.gbName}>{getLocalizedName(item.name)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredGBs}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyMessage}>{t("addGBComponent.emptyMessage")}</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#0f1115',
  },
  gbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#1b1f2a',
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2f3a',
  },
  gbImage: {
    width: 50,
    height: 50,
    marginRight: 15,
    resizeMode: 'contain'
  },
  gbName: {
    fontSize: 18,
    color: '#e6e9ef',
  },
  emptyMessage: {
    padding: 15,
    textAlign: 'center',
    color: '#9aa3b2',
    fontSize: 16
  }
});

export default AddGBComponent;
