import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- ИЗМЕНЕНО: Правильный импорт ---
import database from '@react-native-firebase/database';
import { getPresenceStatusLabel } from './presenceUtils';
import { filterGbgBots } from '../../src/utils/guildBots';
import { DarkThemeColors as C } from '../../constants/theme';

// --- УДАЛЕНЫ неверные импорты ---
// import { get, getDatabase, ref } from 'firebase/database';
// import { database } from '../../firebaseConfig';

const GuildMembersList = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState([]);
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
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => handleTap(item)}
      style={[styles.memberContainer, selectedMembers.includes(item.id) && styles.memberContainerSelected]}
    >
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{item.name?.slice(0, 2).toUpperCase() || '??'}</Text>
          </View>
        )}
        <View style={styles.textContainer}>
          <Text numberOfLines={1} style={styles.memberName}>{item.name}</Text>
          <Text numberOfLines={1} style={styles.memberStatus}>{getPresenceStatusLabel(item.presence)}</Text>
        </View>
        <View style={[styles.selectionCircle, selectedMembers.includes(item.id) && styles.selectionCircleActive]}>
          {selectedMembers.includes(item.id) && <Ionicons name="checkmark" size={18} color="#fff" />}
        </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
        <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectedMembers.length > 0 && (
        <View style={styles.selectionInfo}>
          <View style={styles.selectionCopy}>
            <Text style={styles.selectionText}>
              Обрано: {selectedMembers.length}
            </Text>
            <Text style={styles.selectionHint}>Для групи потрібно щонайменше двоє</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={selectedMembers.length === 1}
            onPress={() => navigation.navigate('CreateGroupScreen', { selectedMembers })}
            style={[styles.addButton, selectedMembers.length === 1 && styles.buttonDisabled]}
          >
            <Text style={styles.addButtonText}>Далі</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={members}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />
      <View style={styles.selectAllContainer}>
        <TouchableOpacity activeOpacity={0.8} onPress={handleSelectAll} style={styles.selectAllButton}>
          <Ionicons
            name={selectedMembers.length === members.length ? 'close-circle-outline' : 'checkmark-done-outline'}
            size={20}
            color={C.primary}
          />
          <Text style={styles.selectAllText}>
            {selectedMembers.length === members.length ? 'Зняти вибір' : 'Обрати всіх'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.background,
  },
  memberContainer: {
    flexDirection: 'row',
    minHeight: 70,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  memberContainerSelected: {
    borderColor: C.primary,
    backgroundColor: C.surfaceElevated,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceElevated,
  },
  avatarInitials: {
    color: C.primarySoft,
    fontSize: 14,
    fontWeight: '800',
  },
  textContainer: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  memberStatus: {
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 3,
  },
  selectionCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCircleActive: {
    borderColor: C.primary,
    backgroundColor: C.primary,
  },
  selectionInfo: {
    minHeight: 76,
    margin: 14,
    marginBottom: 10,
    padding: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCopy: { flex: 1, marginRight: 10 },
  selectionText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  selectionHint: { color: C.textSecondary, fontSize: 11, marginTop: 3 },
  addButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonDisabled: { opacity: 0.4 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  listContent: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  selectAllContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  selectAllButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  selectAllText: { color: C.primarySoft, fontSize: 14, fontWeight: '800' },
});

export default GuildMembersList;
