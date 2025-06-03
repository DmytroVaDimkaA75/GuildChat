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
  Alert,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ref, get, update, remove } from 'firebase/database';
import { database } from '../../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

//
// Вбудований Stepper без onLayout
//
const Stepper = ({
  value,
  onValueChange,
  buttonSize = 35,
  minValue = 0,
  maxValue = 200
}) => {
  const [inputValue, setInputValue] = useState(String(value));

  // Підхоплюємо зовнішні зміни value
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleIncrement = () => {
    const newVal = Math.min(value + 1, maxValue);
    onValueChange(newVal);
    setInputValue(String(newVal));
  };

  const handleDecrement = () => {
    const newVal = Math.max(value - 1, minValue);
    onValueChange(newVal);
    setInputValue(String(newVal));
  };

  const handleInputChange = text => {
    if (/^\d*$/.test(text)) {
      setInputValue(text);
    }
  };

  const handleEndEditing = () => {
    let newVal = parseInt(inputValue, 10);
    if (isNaN(newVal)) newVal = minValue;
    else if (newVal > maxValue) newVal = maxValue;
    else if (newVal < minValue) newVal = minValue;
    onValueChange(newVal);
    setInputValue(String(newVal));
  };

  return (
    <View style={styles.stepperContainer}>
      <TouchableOpacity
        onPress={handleDecrement}
        style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}
      >
        <Text style={styles.stepButtonText}>–</Text>
      </TouchableOpacity>

      <TextInput
        style={[styles.valueInput, { height: buttonSize }]}
        keyboardType="numeric"
        value={inputValue}
        onChangeText={handleInputChange}
        onEndEditing={handleEndEditing}
      />

      <TouchableOpacity
        onPress={handleIncrement}
        style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}
      >
        <Text style={styles.stepButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

//
// Головний компонент
//
const MyGB = () => {
  const { t, i18n } = useTranslation();
  const [greatBuilds, setGreatBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigation = useNavigation();

  // Додаємо forceReload для примусового оновлення
  const [forceReload, setForceReload] = useState(0);

  const getLocalizedBuildingName = building => {
    if (building.buildingName && typeof building.buildingName === 'object') {
      return building.buildingName[i18n.language] || building.buildingName.uk || '';
    }
    return building.buildingName;
  };

  useEffect(() => {
    const fetchGreatBuilds = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        const userId  = await AsyncStorage.getItem('userId');
        if (!guildId || !userId) throw new Error(t("myGB.asyncStorageError"));

        const expressSnap = await get(ref(database, `guilds/${guildId}/express`));
        const expressData = expressSnap.exists() ? expressSnap.val() : {};

        const buildsSnap = await get(ref(
          database,
          `guilds/${guildId}/guildUsers/${userId}/greatBuild`
        ));
        if (!buildsSnap.exists()) {
          setGreatBuilds([]);
          setLoading(false);
          return;
        }
        const buildData     = buildsSnap.val();
        const buildingsSnap = await get(ref(database, 'greatBuildings'));
        const buildingsData = buildingsSnap.exists() ? buildingsSnap.val() : {};

        const buildsList = Object.keys(buildData).map(key => ({
          id: key,
          ...buildData[key]
        }));

        const merged = buildsList.map(b => {
          const scheduled = Object
            .values(expressData)
            .some(rec => rec.allowedGB === b.id && rec.user === userId);
          return {
            ...b,
            ...(buildingsData[b.id] || {}),
            expressScheduled: scheduled
          };
        });

        setGreatBuilds(merged);
        setLoading(false);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err);
        setLoading(false);
      }
    };

    fetchGreatBuilds();
  }, [t, i18n.language, forceReload]); // Додаємо forceReload

  const handleValueChange = async (buildId, newLevel) => {
    try {
      console.log(`🌀 build ${buildId} → new level:`, newLevel);
      const guildId = await AsyncStorage.getItem('guildId');
      const userId  = await AsyncStorage.getItem('userId');
      if (!guildId || !userId) throw new Error(t("myGB.asyncStorageError"));

      await update(
        ref(
          database,
          `guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildId}`
        ),
        { level: newLevel }
      );

      setGreatBuilds(prev =>
        prev.map(b => b.id === buildId ? { ...b, level: newLevel } : b)
      );
    } catch (err) {
      console.error('Update error:', err);
    }
  };

  const handleDelete = async (buildId) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId  = await AsyncStorage.getItem('userId');
      if (!guildId || !userId) throw new Error(t("myGB.asyncStorageError"));

      // 1) Видаляємо саму споруду в гілці користувача
      await remove(ref(
        database,
        `guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildId}`
      ));

      // 2) Видаляємо лише ті express-записи, де allowedGB===buildId та user===userId
      const expressSnap = await get(ref(database, `guilds/${guildId}/express`));
      if (expressSnap.exists()) {
        const expressData = expressSnap.val();
        for (const key of Object.keys(expressData)) {
          const rec = expressData[key];
          if (rec.allowedGB === buildId && rec.user === userId) {
            await remove(ref(database, `guilds/${guildId}/express/${key}`));
          }
        }
      }

      // Оновлюємо локальний стейт
      setGreatBuilds(prev => prev.filter(b => b.id !== buildId));
    } catch (err) {
      console.error('Error deleting build references:', err);
      Alert.alert(t("myGB.error"), t("myGB.deleteErrorMessage"));
    }
  };

  // Додаємо ефект для підписки на фокус (оновлення при поверненні на екран)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setForceReload(f => f + 1);
    });
    return unsubscribe;
  }, [navigation]);

  if (loading) return <ActivityIndicator size="large" color="#0000ff" />;
  if (error)   return <Text>{t("Error")}: {error.message || t("myGB.unknownError")}</Text>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        {greatBuilds.length === 0 ? (
          <Text>{t("myGB.noBuilds")}</Text>
        ) : (
          greatBuilds.map(build => {
            const name = getLocalizedBuildingName(build);
            return (
              <View key={build.id} style={styles.buildItem}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => Alert.alert(
                    t("myGB.deleteConfirmationTitle"),
                    t("myGB.deleteConfirmationMessage"),
                    [
                      { text: t("myGB.cancel"), style: 'cancel' },
                      { text: t("myGB.delete"), onPress: () => handleDelete(build.id) }
                    ],
                    { cancelable: false }
                  )}
                >
                  <Ionicons name="close" size={24} color="black" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate('GBGuarant', {
                    buildingName:  name,
                    buildingId:    build.id,
                    buildingImage: build.buildingImage
                  })}
                >
                  <View style={styles.imageNameContainer}>
                    <View style={styles.imageContainer}>
                      {build.buildingImage
                        ? <Image source={{ uri: build.buildingImage }} style={styles.buildingImage}/>
                        : <Text>{t("myGB.imageNotAvailable")}</Text>
                      }
                    </View>

                    <View style={styles.nameContainer}>
                      <Text style={styles.buildName}>{name}</Text>

                      <View style={styles.additionalLevelBlock}>
                        <View style={styles.additionalLevelText}>
                          <Text>{t("myGB.levelLabel")}</Text>
                        </View>
                        <View style={styles.additionalLevelStepper}>
                          <Stepper
                            value={build.level}
                            onValueChange={val => handleValueChange(build.id, val)}
                          />
                        </View>
                      </View>

                      <View style={styles.buttonContainer}>
                        <TouchableOpacity
                          style={[
                            styles.createButton,
                            build.expressScheduled && styles.createButtonDisabled
                          ]}
                          onPress={() => navigation.navigate('GBNewExpress', { buildingId: build.id })}
                          disabled={build.expressScheduled}
                        >
                          <Text style={styles.createButtonText}>
                            {t("myGB.scheduleExpress")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:              { flex: 1, padding: 10, backgroundColor: '#fff' },
  scrollView:             { paddingBottom: 20 },
  buildItem:              { backgroundColor:'#e0e0e0', borderWidth:1, borderColor:'#000', borderRadius:5, marginBottom:15, padding:10, position:'relative' },
  deleteButton:           { position:'absolute', top:5, right:5, zIndex:1 },
  imageNameContainer:     { flexDirection:'row', alignItems:'center' },
  imageContainer:         { width:100, height:100, borderWidth:1, borderRadius:8, justifyContent:'center', alignItems:'center', marginRight:10, backgroundColor:'#fff' },
  buildingImage:          { width:'100%', height:'100%', resizeMode:'contain' },
  nameContainer:          { flex:1, backgroundColor:'#e0e0e0', padding:5 },
  buildName:              { fontSize:18, fontWeight:'bold', marginBottom:8 },
  additionalLevelBlock:   { flexDirection:'row', alignItems:'center', borderColor:'orange' },
  additionalLevelText:    { flex:1, borderWidth:1, borderColor:'#ddd', alignItems:'center', paddingVertical:4 },
  additionalLevelStepper: { flex:1, borderWidth:1, borderColor:'#ddd', alignItems:'center', justifyContent:'center', paddingVertical:4 },
  stepperContainer:       { flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#007AFF', borderRadius:4, overflow:'hidden' },
  stepButton:             { justifyContent:'center', alignItems:'center', backgroundColor:'#007AFF' },
  stepButtonText:         { color:'#fff', fontSize:16 },
  valueInput:             { flex:1, textAlign:'center', backgroundColor:'#fff', borderLeftWidth:1, borderRightWidth:1, borderColor:'#007AFF', fontSize:14, color:'#000' },
  buttonContainer:        { alignItems:'flex-end', marginTop:10 },
  createButton:           { backgroundColor:'#007AFF', paddingVertical:8, paddingHorizontal:12, borderRadius:5 },
  createButtonText:       { color:'#fff', fontSize:14, fontWeight:'bold' },
  createButtonDisabled:   { backgroundColor:'#aaa' },
});

export default MyGB;
