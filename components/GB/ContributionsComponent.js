import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Button, FlatList, Text, TextInput, View } from 'react-native';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';


const ContributionsComponent = ({ buildingId }) => {
  const [contribution, setContribution] = useState('');
  const [contributionsList, setContributionsList] = useState([]);

  useEffect(() => {
    const fetchContributions = async () => {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');

      // НОВИЙ СИНТАКСИС
      const snapshot = await database()
        .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildingId}/patrons`)
        .once('value');
        
      const data = snapshot.val();
      if (data) {
        setContributionsList(Object.values(data));
      }
    };

    fetchContributions();
  }, [buildingId]);

  const handleAddContribution = async () => {
    if (!contribution) return;

    const guildId = await AsyncStorage.getItem('guildId');
    const userId = await AsyncStorage.getItem('userId');

    const newContribution = {
      amount: parseFloat(contribution),
      timestamp: Date.now(),
      userId,
    };

    // НОВИЙ СИНТАКСИС
    await database()
      .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildingId}/patrons`)
      .push()
      .set(newContribution);

    setContributionsList((prev) => [...prev, newContribution]);
    setContribution('');
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <TextInput
        placeholder="Введіть суму вкладу"
        value={contribution}
        onChangeText={setContribution}
        keyboardType="numeric"
        style={{ marginBottom: 10, borderWidth: 1, padding: 8 }}
      />
      <Button title="Додати вклад" onPress={handleAddContribution} />
      
      <FlatList
        data={contributionsList}
        keyExtractor={(item) => item.timestamp.toString()}
        renderItem={({ item }) => (
          <Text style={{ marginVertical: 5 }}>
            Вклад: {item.amount} - Час: {new Date(item.timestamp).toLocaleString()}
          </Text>
        )}
      />
    </View>
  );
};

export default ContributionsComponent;