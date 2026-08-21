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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';


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

        // НОВИЙ СИНТАКСИС
        const expressSnap = await database().ref(`guilds/${guildId}/express`).once('value');
        const expressData = expressSnap.exists() ? expressSnap.val() : {};

        const buildsSnap = await database()
          .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild`)
          .once('value');

        if (!buildsSnap.exists()) {
          setGreatBuilds([]);
          setLoading(false);
          return;
        }
        const buildData = buildsSnap.val();

        const buildingsSnap = await database().ref('greatBuildings').once('value');
        const buildingsData = buildingsSnap.exists() ? buildingsSnap.val() : {};

        const buildsList = Object.keys(buildData).map(key => ({
          id: key,
          ...buildData[key]
        }));

        const merged = buildsList.map(b => {
          const scheduled = Object
            .values(expressData)
            .some(rec => rec?.gbs
              ? Object.values(rec.gbs).some((gb) => gb.allowedGB === b.id && gb.user === userId)
              : rec.allowedGB === b.id && rec.user === userId);
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

      // НОВИЙ СИНТАКСИС
      await database()
        .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildId}`)
        .update({ level: newLevel });

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

      // 1) Видаляємо саму споруду в гілці користувача (НОВИЙ СИНТАКСИС)
      await database()
        .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildId}`)
        .remove();

      // 2) Видаляємо лише ті express-записи, де allowedGB===buildId та user===userId (НОВИЙ СИНТАКСИС)
      const expressSnap = await database().ref(`guilds/${guildId}/express`).once('value');
      if (expressSnap.exists()) {
        const expressData = expressSnap.val();
        for (const key of Object.keys(expressData)) {
          const rec = expressData[key];
          if (rec.allowedGB === buildId && rec.user === userId) {
            await database().ref(`guilds/${guildId}/express/${key}`).remove();
          }
        }
      }

       // 3) Видаляємо всі повідомлення з GBChat, які відносяться до видаленої ВС (НОВИЙ СИНТАКСИС)
      const gbChatSnap = await database().ref(`guilds/${guildId}/GBChat`).once('value');
      if (gbChatSnap.exists()) {
        const gbChatData = gbChatSnap.val();
        for (const chatKey of Object.keys(gbChatData)) {
          const chat = gbChatData[chatKey];
          if (!chat.messages) continue;
          for (const msgKey of Object.keys(chat.messages)) {
            const msg = chat.messages[msgKey];
            if (msg.build === buildId && msg.senderId === userId) {
              await database()
                .ref(`guilds/${guildId}/GBChat/${chatKey}/messages/${msgKey}`)
                .remove();
            }
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

  if (loading) return <ActivityIndicator size="large" color="#4ea1ff" />;
  if (error)   return <Text style={styles.errorText}>{t("Error")}: {error.message || t("myGB.unknownError")}</Text>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        {greatBuilds.length === 0 ? (
          <Text style={styles.infoText}>{t("myGB.noBuilds")}</Text>
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
                  <Ionicons name="close" size={24} color="#e6e9ef" />
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
                        : <Text style={styles.mutedText}>{t("myGB.imageNotAvailable")}</Text>
                      }
                    </View>

                    <View style={styles.nameContainer}>
                      <Text style={styles.buildName}>{name}</Text>

                      <View style={styles.additionalLevelBlock}>
                        <View style={styles.additionalLevelText}>
                          <Text style={styles.mutedText}>{t("myGB.levelLabel")}</Text>
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

// Стили остаются без изменений
const styles = StyleSheet.create({
    container:              { flex: 1, padding: 10, backgroundColor: '#0f1115' },
    scrollView:             { paddingBottom: 20 },
    buildItem:              { backgroundColor:'#152330', borderWidth:1, borderColor:'#1b2b3b', borderRadius:5, marginBottom:15, padding:10, position:'relative' },
    deleteButton:           { position:'absolute', top:5, right:5, zIndex:1 },
    imageNameContainer:     { flexDirection:'row', alignItems:'center' },
    imageContainer:         { width:100, height:100, borderWidth:1, borderRadius:8, justifyContent:'center', alignItems:'center', marginRight:10, backgroundColor:'#0f1115', borderColor:'#1b2b3b' },
    buildingImage:          { width:'100%', height:'100%', resizeMode:'contain' },
    nameContainer:          { flex:1, backgroundColor:'#152330', padding:5 },
    buildName:              { fontSize:18, fontWeight:'bold', marginBottom:8, color:'#e6e9ef' },
    additionalLevelBlock:   { flexDirection:'row', alignItems:'center', borderColor:'orange' },
    additionalLevelText:    { flex:1, borderWidth:1, borderColor:'#1b2b3b', alignItems:'center', paddingVertical:4 },
    additionalLevelStepper: { flex:1, borderWidth:1, borderColor:'#1b2b3b', alignItems:'center', justifyContent:'center', paddingVertical:4 },
    stepperContainer:       { flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#4ea1ff', borderRadius:4, overflow:'hidden' },
    stepButton:             { justifyContent:'center', alignItems:'center', backgroundColor:'#4ea1ff' },
    stepButtonText:         { color:'#fff', fontSize:16 },
    valueInput:             { flex:1, textAlign:'center', backgroundColor:'#0f1115', borderLeftWidth:1, borderRightWidth:1, borderColor:'#4ea1ff', fontSize:14, color:'#e6e9ef' },
    buttonContainer:        { alignItems:'flex-end', marginTop:10 },
    createButton:           { backgroundColor:'#4ea1ff', paddingVertical:8, paddingHorizontal:12, borderRadius:5 },
    createButtonText:       { color:'#fff', fontSize:14, fontWeight:'bold' },
    createButtonDisabled:   { backgroundColor:'#36516a' },
    mutedText:              { color:'#9aa3b2' },
    infoText:               { color:'#e6e9ef' },
    errorText:              { color:'#ff6b6b', paddingHorizontal: 10, paddingTop: 10 },
  });

export default MyGB;
