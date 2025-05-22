import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  ScrollView, 
  Image, 
  TouchableOpacity, 
  Text as RNText,
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Tooltip from 'react-native-walkthrough-tooltip';
import { ref, get, update, remove } from 'firebase/database';
import { database } from '../../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Stepper from '../CustomElements/Stepper';
import { useTranslation } from 'react-i18next';

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
        const guildsRef = ref(database, `guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild`);
        const greatBuildingsRef = ref(database, 'greatBuildings');

        const buildSnapshot = await get(guildsRef);
        const buildData = buildSnapshot.exists() ? buildSnapshot.val() : {};
        const buildingsSnapshot = await get(greatBuildingsRef);
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
  }, [i18n.language]);

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
              const buildRef = ref(database, `guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildId}`);
              await remove(buildRef);
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
      const buildRef = ref(database, `guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildId}`);
      await update(buildRef, { level: newValue });
      setGreatBuilds(prev => prev.map(b => b.id === buildId ? { ...b, level: newValue } : b));
    } catch (err) {
      console.error('Error updating build level:', err);
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#0000ff" />;
  if (error) return <RNText>{t("Error")}:{error.message || t("myGB.unknownError")}</RNText>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        {greatBuilds.length === 0
          ? <RNText>{t("myGB.noBuilds")}</RNText>
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
                      <Ionicons name="close" size={24} color="black" />
                    </TouchableOpacity>
                    <View style={styles.imageNameContainer}>
                      <View style={styles.imageContainer}>
                        {build.buildingImage
                          ? <Image source={{ uri: build.buildingImage }} style={styles.buildingImage} />
                          : <RNText>{t("myGB.imageNotAvailable")}</RNText>}
                      </View>
                      <View style={styles.nameContainer}>
                        <View style={styles.nameBlock}><RNText style={styles.buildName}>{localizedName}</RNText></View>
                        <View style={styles.additionalLevelBlock}>
                          <View style={styles.additionalLevelText}><RNText>{t("myGB.levelLabel")}</RNText></View>
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, backgroundColor: '#fff' },
  scrollView: { paddingBottom: 20 },
  buildItem: { backgroundColor: '#e0e0e0', borderWidth: 1, borderColor: '#000', borderRadius: 5, marginBottom: 15, padding: 10, position: 'relative' },
  deleteButton: { position: 'absolute', top: 5, right: 5, zIndex: 1 },
  imageNameContainer: { flexDirection: 'row', alignItems: 'center' },
  imageContainer: { width: 100, height: 100, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: '#fff' },
  buildingImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  nameContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'stretch', backgroundColor: '#e0e0e0' },
  nameBlock: { padding: 5, alignItems: 'center' },
  additionalLevelBlock: { flexDirection: 'row', alignItems: 'center' },
  additionalLevelText: { flex: 1, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', paddingVertical: 6 },
  additionalLevelStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 4,
    overflow: 'hidden',
    height: 30,
  },
  buttonContainer: { alignItems: 'flex-end', marginTop: 10 },
  createButton: { backgroundColor: '#007AFF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5 },
  createButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  buildName: { fontSize: 18, fontWeight: 'bold' }
});

export default MyGB;
