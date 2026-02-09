import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
// import { get, ref, remove, update } from 'firebase/database'; // <- УДАЛЕНО
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Text as RNText,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО
import Stepper from '../CustomElements/Stepper';

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';

const MyGB = () => {
  const { t, i18n } = useTranslation();
  const [greatBuilds, setGreatBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigation = useNavigation();

  const getLocalizedBuildingName = (building) => {
    if (building && typeof building.buildingName === 'object') {
      return building.buildingName[i18n.language] || building.buildingName['uk'] || '';
    }
    return building.buildingName;
  };

  useEffect(() => {
    const fetchGreatBuilds = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        if (!storedGuildId || !storedUserId) {
          throw new Error(t("myGB.asyncStorageError"));
        }

        // НОВИЙ СИНТАКСИС
        const guildsRef = database().ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild`);
        const greatBuildingsRef = database().ref('greatBuildings');

        const buildSnapshot = await guildsRef.once('value');
        const buildData = buildSnapshot.exists() ? buildSnapshot.val() : {};
        
        const buildingsSnapshot = await greatBuildingsRef.once('value');
        const buildingsData = buildingsSnapshot.exists() ? buildingsSnapshot.val() : {};

        const buildsList = Object.keys(buildData).map(key => ({ id: key, ...buildData[key] }));
        const mergedBuilds = buildsList.map(build => ({ ...build, ...(buildingsData[build.id] || {}) }));
        setGreatBuilds(mergedBuilds);
        setLoading(false);
      } catch (err) {
        console.error('Error during fetch:', err);
        setError(err);
        setLoading(false);
      }
    };
    fetchGreatBuilds();
  }, [i18n.language, t]);

  const handleDelete = async (buildId) => {
    try {
      Alert.alert(
        t("myGB.deleteConfirmationTitle"),
        t("myGB.deleteConfirmationMessage"),
        [
          { text: t("myGB.cancel"), style: 'cancel' },
          { text: t("myGB.delete"), onPress: async () => {
              const storedGuildId = await AsyncStorage.getItem('guildId');
              const storedUserId = await AsyncStorage.getItem('userId');
              if (!storedGuildId || !storedUserId) throw new Error(t("myGB.asyncStorageError"));
              
              // НОВИЙ СИНТАКСИС
              const buildRef = database().ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildId}`);
              await buildRef.remove();
              
              setGreatBuilds(prev => prev.filter(b => b.id !== buildId));
          }}
        ], { cancelable: false }
      );
    } catch (err) {
      console.error('Error deleting build:', err);
    }
  };

  const handleValueChange = async (buildId, newValue) => {
    try {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      if (!storedGuildId || !storedUserId) throw new Error(t("myGB.asyncStorageError"));
      
      // НОВИЙ СИНТАКСИС
      const buildRef = database().ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildId}`);
      await buildRef.update({ level: newValue });
      
      setGreatBuilds(prev => prev.map(b => b.id === buildId ? { ...b, level: newValue } : b));
    } catch (err) {
      console.error('Error updating build level:', err);
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#4ea1ff" />;
  if (error) return <RNText style={styles.errorText}>{t("Error")}:{error.message || t("myGB.unknownError")}</RNText>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        {greatBuilds.length === 0
          ? <RNText style={styles.infoText}>{t("myGB.noBuilds")}</RNText>
          : greatBuilds.map(build => {
              const localizedName = getLocalizedBuildingName(build);
              return (
                <TouchableOpacity key={build.id} onPress={() => navigation.navigate('GBGuarant', {
                    buildingName: localizedName,
                    buildingId: build.id,
                    buildingImage: build.buildingImage
                  })}>
                  <View style={styles.buildItem}>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(build.id)}>
                      <Ionicons name="close" size={24} color="#e6e9ef" />
                    </TouchableOpacity>
                    <View style={styles.imageNameContainer}>
                      <View style={styles.imageContainer}>
                        {build.buildingImage
                          ? <Image source={{ uri: build.buildingImage }} style={styles.buildingImage} />
                          : <RNText style={styles.mutedText}>{t("myGB.imageNotAvailable")}</RNText>}
                      </View>
                      <View style={styles.nameContainer}>
                        <View style={styles.nameBlock}><RNText style={styles.buildName}>{localizedName}</RNText></View>
                        <View style={styles.additionalLevelBlock}>
                          <View style={styles.additionalLevelText}><RNText style={styles.mutedText}>{t("myGB.levelLabel")}</RNText></View>
                          <View style={styles.additionalLevelStepper}>
                            <Stepper
                              key={`stepper-${build.id}-${build.level}`}
                              initialValue={build.level}
                              step={1}
                              maxValue={200}
                              buildId={build.id}
                              onValueChange={handleValueChange}
                            />
                          </View>
                        </View>
                        <View style={styles.buttonContainer}>
                          <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('GBNewExpress', { buildingId: build.id })}>
                            <RNText style={styles.createButtonText}>{t("myGB.scheduleExpress")}</RNText>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
      </ScrollView>
    </View>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, backgroundColor: '#0f1115' },
  scrollView: { paddingBottom: 20 },
  buildItem: { backgroundColor: '#1b1f2a', borderWidth: 1, borderColor: '#2a2f3a', borderRadius: 5, marginBottom: 15, padding: 10, position: 'relative' },
  deleteButton: { position: 'absolute', top: 5, right: 5, zIndex: 1 },
  imageNameContainer: { flexDirection: 'row', alignItems: 'center' },
  imageContainer: { width: 100, height: 100, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: '#0f1115', borderColor: '#2a2f3a' },
  buildingImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  nameContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'stretch', backgroundColor: '#1b1f2a' },
  nameBlock: { padding: 5, alignItems: 'center' },
  additionalLevelBlock: { flexDirection: 'row', alignItems: 'center' },
  additionalLevelText: { flex: 1, borderWidth: 1, borderColor: '#2a2f3a', alignItems: 'center', paddingVertical: 6 },
  additionalLevelStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4ea1ff',
    borderRadius: 4,
    overflow: 'hidden',
    height: 30,
  },
  buttonContainer: { alignItems: 'flex-end', marginTop: 10 },
  createButton: { backgroundColor: '#2f7de1', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5 },
  createButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  buildName: { fontSize: 18, fontWeight: 'bold', color: '#e6e9ef' },
  mutedText: { color: '#9aa3b2' },
  infoText: { color: '#e6e9ef' },
  errorText: { color: '#ff6b6b', paddingHorizontal: 10, paddingTop: 10 },
});

export default MyGB;
