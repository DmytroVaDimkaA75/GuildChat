import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { getDatabase, ref, onValue } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AddGBComponent = () => {
  const [availableGBs, setAvailableGBs] = useState([]);
  const [userGBs, setUserGBs] = useState([]);
  const [guildId, setGuildId] = useState(null);
  const [userId, setUserId] = useState(null);

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
    if (guildId && userId) {
      const db = getDatabase();

      // Отримання всіх наявних ВС
      const allGBRef = ref(db, 'greatBuildings');
      onValue(allGBRef, (snapshot) => {
        const allGBs = [];
        snapshot.forEach((childSnapshot) => {
          const id = childSnapshot.key;
          const data = childSnapshot.val();
          allGBs.push({ id, name: data.buildingName, image: data.buildingImage });
        });
        setAvailableGBs(allGBs);
      });

      // Отримання ВС користувача
      const userGBRef = ref(db, `guilds/${guildId}/guildUsers/${userId}/greatBuild`);
      onValue(userGBRef, (snapshot) => {
        const userGBs = [];
        snapshot.forEach((childSnapshot) => {
          userGBs.push(childSnapshot.key);
        });
        setUserGBs(userGBs);
      });
    }
  }, [guildId, userId]);

  const filteredGBs = availableGBs.filter((gb) => !userGBs.includes(gb.id));

  const renderItem = ({ item }) => (
    <View style={styles.gbItem}>
      <Image source={{ uri: item.image }} style={styles.gbImage} />
      <Text style={styles.gbName}>{item.name}</Text>
    </View>
  );

  return (
    <FlatList
      data={filteredGBs}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.emptyMessage}>Немає доступних ВС для додавання</Text>}
    />
  );
};

const styles = StyleSheet.create({
  gbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    //borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  gbImage: {
    width: 50,
    height: 50,
    marginRight: 15,
    resizeMode: 'contain',
  },
  gbName: {
    fontSize: 18,
  },
  emptyMessage: {
    padding: 15,
    textAlign: 'center',
    color: '#888',
    fontSize: 16,
  },
});

export default AddGBComponent;
