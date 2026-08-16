import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// --- ИЗМЕНЕНО: Правильный импорт ---
import database from '@react-native-firebase/database';
import { getPresenceStatusLabel } from './presenceUtils';
import { filterGbgBots } from '../../src/utils/guildBots';

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
    let guildRef;
    let listener;

    const fetchGuildMembers = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        const userId = await AsyncStorage.getItem('userId');

        if (!guildId || !userId) {
          throw new Error('guildId або userId не знайдено');
        }

        // --- ИЗМЕНЕНО: Синтаксис `ref` и `once` для @react-native-firebase ---
        guildRef = database().ref(`guilds/${guildId}/guildUsers`);
        listener = guildRef.on('value', async (snapshot) => {
          if (snapshot.exists()) {
            const guildMembersData = await filterGbgBots(guildId, snapshot.val() || {});
            const guildMembers = [];
            
            Object.keys(guildMembersData).forEach((memberId) => {
              if (memberId !== userId) {
                const memberData = guildMembersData[memberId];
                guildMembers.push({
                  id: memberId,
                  name: memberData.userName,
                  avatarUrl: memberData.imageUrl,
                  presence: memberData.presence || null,
                });
              }
            });

            setMembers(guildMembers);
          } else {
            console.error('Дані не знайдено');
          }
          setLoading(false);
        });
      } catch (error) {
        console.error('Помилка при отриманні членів гільдії: ', error);
        setLoading(false);
      } finally {
        if (!guildRef) {
          setLoading(false);
        }
      }
    };

    fetchGuildMembers();
    return () => {
      if (guildRef && listener) {
        guildRef.off('value', listener);
      }
    };
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
              <Path d={`M${(checkmarkSize * 20) / 24} ${(checkmarkSize * 6) / 24}L${(checkmarkSize * 9) / 24} ${(checkmarkSize * 17) / 24}L${(checkmarkSize * 4) / 24} ${(checkmarkSize * 12) / 24}`} stroke="#4ea1ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
          <Text style={styles.memberStatus}>{getPresenceStatusLabel(item.presence)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
        <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#4cd137" />
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
              color="#4cd137"
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
          color="#4ea1ff"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1115',
  },
  memberContainer: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    color: '#FFFFFF',
  },
  memberStatus: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  checkmark: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  selectionInfo: {
    padding: 10,
    backgroundColor: '#152330',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionText: {
    fontSize: 16,
    flex: 1,
    color: '#FFFFFF',
  },
  selectAllContainer: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#0f1115',
  },
});

export default GuildMembersList;
