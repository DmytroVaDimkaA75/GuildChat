import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// --- ИЗМЕНЕНО: Правильный импорт ---
import database from '@react-native-firebase/database';

// --- УДАЛЕНЫ неверные импорты ---
// import { get, getDatabase, ref } from 'firebase/database';
// import { database } from '../../firebaseConfig';

const GuildMembersList = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const checkmarkSize = 26;
  const navigation = useNavigation();
  
  useEffect(() => {
    const fetchGuildMembers = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        const userId = await AsyncStorage.getItem('userId');

        if (!guildId || !userId) {
          throw new Error('guildId або userId не знайдено');
        }

        // --- ИЗМЕНЕНО: Синтаксис `ref` и `once` для @react-native-firebase ---
        const guildRef = database().ref(`guilds/${guildId}/guildUsers`);
        const snapshot = await guildRef.once('value');

        if (snapshot.exists()) {
          const guildMembersData = snapshot.val();
          const guildMembers = [];
          
          Object.keys(guildMembersData).forEach((memberId) => {
            if (memberId !== userId) {
              const memberData = guildMembersData[memberId];
              guildMembers.push({
                id: memberId,
                name: memberData.userName,
                avatarUrl: memberData.imageUrl,
              });
            }
          });

          setMembers(guildMembers);
        } else {
          console.error('Дані не знайдено');
        }
      } catch (error) {
        console.error('Помилка при отриманні членів гільдії: ', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGuildMembers();
  }, []);

  const handleTap = (member) => {
    setSelectedMembers((prevSelected) => {
      if (prevSelected.includes(member.id)) {
        return prevSelected.filter(id => id !== member.id); // Зняти галочку
      } else {
        return [...prevSelected, member.id]; // Додати галочку
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedMembers.length === members.length) {
      setSelectedMembers([]); // Зняти всі галочки
    } else {
      const allMemberIds = members.map(member => member.id);
      setSelectedMembers(allMemberIds); // Вибрати всіх
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleTap(item)}>
      <View style={styles.memberContainer}>
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        <View style={styles.textContainer}>
          <Text style={styles.memberName}>{item.name}</Text>
          {selectedMembers.includes(item.id) && (
            <Svg width={checkmarkSize} height={checkmarkSize} viewBox="0 0 24 24" fill="none" style={styles.checkmark}>
              <Path d={`M${(checkmarkSize * 20) / 24} ${(checkmarkSize * 6) / 24}L${(checkmarkSize * 9) / 24} ${(checkmarkSize * 17) / 24}L${(checkmarkSize * 4) / 24} ${(checkmarkSize * 12) / 24}`} stroke="#007AFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
          <Text style={styles.memberStatus}>активність — недавно</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
        <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#0000ff" />
        </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectedMembers.length > 0 && (
        <View style={styles.selectionInfo}>
          <View style={styles.selectionRow}>
            <Text style={styles.selectionText}>
              Обрано {selectedMembers.length} користувачів
            </Text>
            <Button 
              title="Додати" 
              onPress={() => {
                navigation.navigate('CreateGroupScreen', { selectedMembers });
              }}
              disabled={selectedMembers.length === 1} // Кнопка пасивна при одному вибраному користувачі
            />
          </View>
        </View>
      )}
      <FlatList
        data={members}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />
      <View style={styles.selectAllContainer}>
        <Button 
          title={selectedMembers.length === members.length ? "Зняти всіх" : "Обрати всіх"} 
          onPress={handleSelectAll} 
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberContainer: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    position: 'relative',
  },
  memberName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberStatus: {
    fontSize: 14,
    color: 'gray',
  },
  checkmark: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  selectionInfo: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionText: {
    fontSize: 16,
    flex: 1,
  },
  selectAllContainer: {
    padding: 10,
    alignItems: 'center',
  },
});

export default GuildMembersList;