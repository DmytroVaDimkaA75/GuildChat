import AsyncStorage from '@react-native-async-storage/async-storage';
// import { get, push, ref, set } from 'firebase/database'; // <- УДАЛЕНО
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО
import GBPatronCalculator from './GBPatronCalculator';

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';

// Константи, що використовуються як у компоненті, так і в стилях
const BLOCK_ONE_WIDTH = 80;
const rowHeight = 40;

const GBPatrons = ({ buildId, level, buildAPI, personalContribution, refresh }) => {
  const { t } = useTranslation();

  // Заголовки стовпців із перекладами (ключі з розділу gbPatrons)
  const columnTitles = [
    t('gbPatrons.column1'),
    t('gbPatrons.column2'),
    t('gbPatrons.column3'),
    t('gbPatrons.column4'),
    t('gbPatrons.column5')
  ];
  const columnWidths = [100, 100, 100, 100, 100];


  // Стан для даних таблиці
  const [forgePointsList, setForgePointsList] = useState([]);
  const [placeMultipliers, setPlaceMultipliers] = useState([]);
  const [placeCosts, setPlaceCosts] = useState([]);
  const [patronsList, setPatronsList] = useState([]);
  const [totalFP, setTotalFP] = useState(0);
  const [ownerContribution, setOwnerContribution] = useState(0);
  const [distribution, setDistribution] = useState([]);
  const [guarArray, setGuarArray] = useState([]);
  const [kfin, setKfin] = useState(null);
  const [nfin, setNfin] = useState(null);
  const screenHeight = Dimensions.get('window').height;
  const tableMaxHeight = screenHeight - 150;

  // Рефи для синхронізації скролу
  const block2ScrollRef = useRef(null);
  const block4HorizontalScrollRef = useRef(null);
  const block3ScrollRef = useRef(null);
  const block4VerticalScrollRef = useRef(null);
  const isSyncingHorizontal = useRef(false);
  const isSyncingVertical = useRef(false);

  // Додаємо стан для шляхів до правил
  const [placeRulePaths, setPlaceRulePaths] = useState([]);

  // 1) Функція для формування placeCosts та placeMultipliers
  const processGreatBuildingBranches = async (greatBuildingId, currentLevel) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const rawUserId = await AsyncStorage.getItem('userId');
      const userIds = rawUserId ? rawUserId.split(',').map(id => id.trim()) : [];

      // Мінімум 5 слотів, або більше, якщо є дані
      const numPlaces = Math.max(5, forgePointsList.length);
      
      // НОВИЙ СИНТАКСИС
      const upgradesRef = database().ref(`guilds/${guildId}/GBChat`);
      const snapshot = await upgradesRef.once('value');

      const localMultipliers = [];
      const localCosts = [];
      const localRulePaths = [];

      if (!snapshot.exists()) {
        // Якщо немає жодних чатів — просто фолбек для всіх слотів
        for (let place = 0; place < numPlaces; place++) {
          const nominal = forgePointsList[place] || 1;
          localMultipliers.push(null);
          localCosts.push(Math.round(nominal));
          localRulePaths.push(null);
        }
      } else {
        const allChats = Object.entries(snapshot.val());
        // Проходимо по кожному слоту з 1 до numPlaces
        for (let place = 1; place <= numPlaces; place++) {
          const nominalRaw = forgePointsList[place - 1];
          const hasNominal = nominalRaw != null;      // реальне значення з API?
          const nominal = hasNominal ? nominalRaw : 1;

          // Для фолбек-слотів відразу пушимо 1 і пропускаємо логіку фільтрації
          if (!hasNominal) {
            localMultipliers.push(null);
            localCosts.push(nominal);
            localRulePaths.push(null);
            continue;
          }

          // Фільтруємо чати за правилами
          const filteredChats = [];
          for (const [chatId, chatData] of allChats) {
            const rules = chatData.rules || {};
            if (rules.allowedGBs && !rules.allowedGBs.includes(greatBuildingId)) continue;
            if (rules.placeLimit && !rules.placeLimit.includes(place)) continue;
            if (rules.levelThreshold && rules.levelThreshold > currentLevel) continue;
            if (rules.selectedMembers) {
              const allowed = userIds.some(uid => rules.selectedMembers.includes(uid));
              if (!allowed) continue;
            }
            filteredChats.push({
              chatId,
              contributionMultiplier: rules.contributionMultiplier || 0,
              rulePath: `guilds/${guildId}/GBChat/${chatId}/rules`
            });
          }

          if (filteredChats.length > 0) {
            // Обчислюємо cost = multiplier * nominal, шукаємо максимум
            const computed = filteredChats.map(ch => ({
              multiplier: ch.contributionMultiplier,
              cost: Math.round(ch.contributionMultiplier * nominal),
              rulePath: ch.rulePath
            }));
            const maxCost = Math.max(...computed.map(c => c.cost));
            const chosen = computed.find(c => c.cost === maxCost);
            localMultipliers.push(chosen.multiplier);
            localCosts.push(chosen.cost);
            localRulePaths.push(chosen.rulePath);
          } else {
            // Якщо жодного чату немає — просто округлюємо nominal
            localMultipliers.push(null);
            localCosts.push(Math.round(nominal));
            localRulePaths.push(null);
          }
        }
      }

      setPlaceMultipliers(localMultipliers.map(m => (m !== null ? parseFloat(m) : null)));
      setPlaceCosts(localCosts);
      setPlaceRulePaths(localRulePaths);
      console.log('processGreatBuildingBranches -> localCosts:', localCosts);

    } catch (error) {
      console.error('processGreatBuildingBranches -> error:', error);
      // Фолбек для випадку помилки
      const fallback = forgePointsList.map(v => Math.round(v || 1));
      setPlaceCosts(fallback);
      setPlaceMultipliers(fallback.map(() => null));
      setPlaceRulePaths(fallback.map(() => null));
    }
  };


  // 2) Функція для отримання даних вкладників та їх коректного логіну
  const getPatronsData = async (greatBuildingId) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      if (!guildId || !userId) return;

      // НОВИЙ СИНТАКСИС
      const patronsRef = database().ref(
        `guilds/${guildId}/guildUsers/${userId}/greatBuild/${greatBuildingId}/investment/patrons`
      );
      const ownerRef = database().ref(
        `guilds/${guildId}/guildUsers/${userId}/greatBuild/${greatBuildingId}/investment/personal`
      );

      const patronsSnap = await patronsRef.once('value');
      if (patronsSnap.exists()) {
        const data = patronsSnap.val();
        let arr = Object.entries(data).map(([rid, rec]) => ({
          recordId: rid,
          patronId: rec.patron,
          userName: rec.userName || t('gbPatrons.none'),
          invest: Number(rec.invest) || 0,
          rawTimestamp: rec.timestamp || 0,
        }));

        // Для 'stranger' та 'friend' встановлюємо відповідні значення, для інших - запит до users/{patronId}
        arr = await Promise.all(
          arr.map(async patron => {
            if (patron.patronId === 'stranger') {
              return { ...patron, userName: 'Чужинець' };
            } else if (patron.patronId === 'friend') {
              return { ...patron, userName: 'Друг' };
            } else {
              try {
                // НОВИЙ СИНТАКСИС
                const userSnap = await database().ref(`users/${patron.patronId}`).once('value');
                if (userSnap.exists()) {
                  const userData = userSnap.val();
                  return { ...patron, userName: userData.userName || patron.userName };
                } else {
                  return patron;
                }
              } catch (error) {
                return patron;
              }
            }
          })
        );
        setPatronsList(arr);
        console.log('getPatronsData -> patronsList:', arr);
      } else {
        setPatronsList([]);
        console.log('getPatronsData -> no patrons found');
      }

      const ownerSnap = await ownerRef.once('value');
      if (ownerSnap.exists()) {
        setOwnerContribution(Number(ownerSnap.val()) || 0);
      } else {
        setOwnerContribution(0);
      }
    } catch (error) {
      console.error('getPatronsData -> error:', error);
    }
  };

  
  // 3) Отримання даних з API (total_fp та forgePointsList)
  useEffect(() => {
    if (buildAPI && level !== null) {
      fetch(buildAPI)
        .then(res => res.json())
        .then(data => {
          const d = data.response;
          if (d) {
            if (typeof d.total_fp === 'number') {
              setTotalFP(d.total_fp);
            }
            if (d.patron_bonus) {
              const arr = d.patron_bonus.map(b => b.forgepoints);
              setForgePointsList(arr);
            }
          }
        })
        .catch(err => {
          console.error('API fetch error:', err);
        });
    }
  }, [buildAPI, level, personalContribution]);

  useEffect(() => {
    if (buildId) {
      getPatronsData(buildId);
    }
  }, [buildId, refresh, personalContribution]); 

  // 4) Отримання даних вкладників при зміні buildId
  useEffect(() => {
    if (buildId) {
      getPatronsData(buildId);
    }
  }, [buildId, personalContribution]); 

  // 5) Обробка гілки ВС при зміні buildId та level
  useEffect(() => {
    if (buildId && level) {
      processGreatBuildingBranches(buildId, level);
    }
  }, [buildId, level, forgePointsList, personalContribution]); 

  // 6) Розрахунок розподілу (distribution) для таблиці
  useEffect(() => {
    if (placeCosts.length === 0 || !totalFP) return;

    const numPrizeSlots = Math.max(5, placeCosts.length);
    const prizeDist = new Array(numPrizeSlots).fill(null);

    const sumInv = patronsList.reduce((acc, p) => acc + p.invest, 0);
    const leftover = totalFP - (ownerContribution + sumInv);

    const sorted = [...patronsList].sort((a, b) => {
      if (b.invest !== a.invest) return b.invest - a.invest;
      return a.rawTimestamp - b.rawTimestamp;
    });

    let placeIndex = 0;
    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      if (placeIndex >= numPrizeSlots) break;
      let placed = false;
      while (!placed && placeIndex < numPrizeSlots) {
        const costNeeded = placeCosts[placeIndex];
        if (player.invest >= costNeeded) {
          prizeDist[placeIndex] = { ...player, finalPlace: placeIndex + 1 };
          placeIndex++;
          placed = true;
        } else {
          const nextP = sorted[i + 1];
          let nextInvest = nextP ? nextP.invest : 0;
          if (nextInvest + leftover >= player.invest) {
            placeIndex++;
          } else {
            prizeDist[placeIndex] = { ...player, finalPlace: placeIndex + 1 };
            placeIndex++;
            placed = true;
          }
        }
      }
    }

    // Визначаємо вкладників, що не потрапили до топ‑5
    const prizeRecordIds = new Set(prizeDist.filter(x => x !== null).map(x => x.recordId));
    const nonDistributed = sorted.filter(p => !prizeRecordIds.has(p.recordId));
    // Формуємо фінальний масив для таблиці:
    // спочатку призові записи, потім всі вкладники, що не отримали приз (finalPlace: "Не отримав")
    const fullDistribution = prizeDist.concat(
      nonDistributed.map(p => ({ ...p, finalPlace: 'Не отримав' }))
    );
    console.log('Full distribution (для таблиці):', fullDistribution);
    setDistribution(fullDistribution);
  }, [placeCosts, totalFP, patronsList, ownerContribution, guarArray]); // Додаємо `guarArray` як залежність

  console.log('Поточна distribution:', distribution);

  // Обчислення висоти таблиці
  const numRows = Math.max(5, distribution.length);
  const contentHeight = numRows * rowHeight;
  const containerHeight = contentHeight < tableMaxHeight ? contentHeight : tableMaxHeight;
  const verticalScrollEnabled = contentHeight >= tableMaxHeight;

  // Функції синхронізації скролу
  const syncHorizontalScroll = (event) => {
    if (isSyncingHorizontal.current) return;
    isSyncingHorizontal.current = true;
    const offsetX = event.nativeEvent.contentOffset.x;
    if (block2ScrollRef.current && block4HorizontalScrollRef.current) {
      block2ScrollRef.current.scrollTo({ x: offsetX, animated: false });
      block4HorizontalScrollRef.current.scrollTo({ x: offsetX, animated: false });
    }
    setTimeout(() => {
      isSyncingHorizontal.current = false;
    }, 0);
  };

  const syncVerticalScroll = (event) => {
    if (isSyncingVertical.current) return;
    isSyncingVertical.current = true;
    const offsetY = event.nativeEvent.contentOffset.y;
    if (block3ScrollRef.current && block4VerticalScrollRef.current) {
      block3ScrollRef.current.scrollTo({ y: offsetY, animated: false });
      block4VerticalScrollRef.current.scrollTo({ y: offsetY, animated: false });
    }
    setTimeout(() => {
      isSyncingVertical.current = false;
    }, 0);
  };
// === Ось головна правка: useMemo для масивів ===
  const placesIds = useMemo(
    () => distribution.map(x => x && x.userName ? x.userName : ''),
    [distribution]
  );
  const placesInvested = useMemo(
    () => distribution.map(x => x && x.invest ? x.invest : 0),
    [distribution]
  );

  // Додаємо локальний стан для поточних вкладень
  const [localInvests, setLocalInvests] = useState({});

  // Оновлюємо локальні інвестиції при зміні списку вкладників
  useEffect(() => {
    if (patronsList.length > 0) {
      const obj = {};
      patronsList.forEach(p => {
        obj[p.recordId] = p.invest;
      });
      setLocalInvests(obj);
    }
  }, [patronsList]);

  // Формуємо distribution з урахуванням локальних інвестицій
  const distributionWithLocalInvests = useMemo(() => {
    if (
      !Array.isArray(placeCosts) ||
      typeof placeCosts.length !== 'number' ||
      placeCosts.length === 0 ||
      !totalFP ||
      !Array.isArray(patronsList)
    ) {
      return [];
    }

    const numPrizeSlots = Math.max(5, placeCosts.length);
    const prizeDist = new Array(numPrizeSlots).fill(null);

    // Підміняємо invest на локальний, якщо є
    const patronsWithLocalInvests = patronsList.map(p => ({
      ...p,
      invest:
        localInvests && Object.prototype.hasOwnProperty.call(localInvests, p.recordId)
          ? Number(localInvests[p.recordId])
          : Number(p.invest),
    }));

    const sumInv = patronsWithLocalInvests.reduce((acc, p) => acc + (Number(p.invest) || 0), 0);
    const leftover = totalFP - (ownerContribution + sumInv);

    const sorted = [...patronsWithLocalInvests].sort((a, b) => {
      if (b.invest !== a.invest) return b.invest - a.invest;
      return a.rawTimestamp - b.rawTimestamp;
    });

    let placeIndex = 0;
    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      if (placeIndex >= numPrizeSlots) break;
      let placed = false;
      while (!placed && placeIndex < numPrizeSlots) {
        const costNeeded = placeCosts[placeIndex];
        if ((Number(player.invest) || 0) >= costNeeded) {
          prizeDist[placeIndex] = { ...player, finalPlace: placeIndex + 1 };
          placeIndex++;
          placed = true;
        } else {
          const nextP = sorted[i + 1];
          let nextInvest = nextP ? Number(nextP.invest) : 0;
          if ((nextInvest || 0) + leftover >= (Number(player.invest) || 0)) {
            placeIndex++;
          } else {
            prizeDist[placeIndex] = { ...player, finalPlace: placeIndex + 1 };
            placeIndex++;
            placed = true;
          }
        }
      }
    }

    const prizeRecordIds = new Set(prizeDist.filter(x => x !== null).map(x => x.recordId));
    const nonDistributed = sorted.filter(p => !prizeRecordIds.has(p.recordId));
    const fullDistribution = prizeDist.concat(
      nonDistributed.map(p => ({ ...p, finalPlace: 'Не отримав' }))
    );
    return fullDistribution;
  }, [
    placeCosts,
    totalFP,
    patronsList,
    ownerContribution,
    localInvests,
  ]);

  // === Виклик компонента розрахунку гарантій з перевіркою перед setState ===
  const handleGuarantorResult = useCallback(({ Guar }) => {
    setGuarArray(prev => (JSON.stringify(prev) !== JSON.stringify(Guar) ? Guar : prev));
  }, []);

  // Додаємо локальний стан для поточних вкладень
  const [calculationKey, setCalculationKey] = useState(0); // Ключ для перезапуску GBPatronCalculator

  // Функція для оновлення інвестиції вкладника у Firebase
  const updatePatronInvest = async (recordId, newValue) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      if (!guildId || !userId) return;
      
      // НОВИЙ СИНТАКСИС
      const patronRef = database().ref(
        `guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildId}/investment/patrons/${recordId}`
      );
      const snap = await patronRef.once('value');
      if (snap.exists()) {
        const data = snap.val();
        await patronRef.set({ ...data, invest: newValue });
      }
    } catch (err) {
      console.error('Помилка оновлення вкладу вкладника:', err);
    }
  };

  const handleStepperChange = (recordId, newValue) => {
    setLocalInvests(prev => ({
      ...prev,
      [recordId]: newValue,
    }));
    updatePatronInvest(recordId, newValue);
  };

  // Обробка натискання на "До прокачки"
  const handleToLevelUpPress = async (rowIndex) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      const rulePath = placeRulePaths[rowIndex];
      if (!guildId || !userId || !rulePath) {
        Alert.alert(t('gbPatrons.toLevelUp'), t('gbPatrons.toLevelUpMsg'));
        return;
      }

      // Витягуємо chatId з rulePath
      const match = rulePath.match(/GBChat\/([^/]+)\/rules/);
      if (!match) {
        Alert.alert(t('gbPatrons.toLevelUp'), t('gbPatrons.toLevelUpMsg'));
        return;
      }
      const chatId = match[1];

      // Формуємо ключ місця
      const placeKey = (rowIndex + 1).toString();

      // Вартість для цього місця
      const placeValue = placeCosts[rowIndex];

      // Дані для places: значенням має бути саме вартість місця
      const placesUpdate = {};
      placesUpdate[placeKey] = placeValue;

      // Вивід id вкладників у консоль
      console.log('patronsList:', patronsList);
      console.log('patronIds:', patronsList.map(p => p.patronId));

      // Збираємо id співгільдійців, які вже зробили внесок (числові id, не stranger/friend)
      const excludedUser = {};
      patronsList.forEach(p => {
        if (
          p.patronId &&
          p.patronId !== 'stranger' &&
          p.patronId !== 'friend' &&
          !isNaN(Number(p.patronId))
        ) {
          excludedUser[p.patronId] = true;
        }
      });

      // Шлях до messages (НОВИЙ СИНТАКСИС)
      const messagesRef = database().ref(`guilds/${guildId}/GBChat/${chatId}/messages`);

      // 1. Отримуємо всі повідомлення
      const snapshot = await messagesRef.once('value');
      let updated = false;

      if (snapshot.exists()) {
        const messages = snapshot.val();
        // 2. Шукаємо повідомлення для цієї споруди і цього користувача
        const messageEntry = Object.entries(messages).find(
          ([, msg]) =>
            msg.build === buildId && msg.senderId === userId
        );

        if (messageEntry) {
          // 3. Оновлюємо об'єкт places у знайденому повідомленні (тільки додаємо/оновлюємо ключ)
          const [messageId, msg] = messageEntry;
          const currentPlaces = typeof msg.places === 'object' && msg.places !== null ? msg.places : {};
          const newPlaces = { ...currentPlaces, ...placesUpdate };
          
          // НОВИЙ СИНТАКСИС
          const messageToUpdateRef = database().ref(`guilds/${guildId}/GBChat/${chatId}/messages/${messageId}/places`);
          await messageToUpdateRef.set(newPlaces);

          // Оновлюємо excludedUser
          if (Object.keys(excludedUser).length > 0) {
            const excludedUserRef = database().ref(`guilds/${guildId}/GBChat/${chatId}/messages/${messageId}/excludedUser`);
            await excludedUserRef.set(excludedUser);
          }

          console.log('Оновлено places та excludedUser у повідомленні:', {
            path: `guilds/${guildId}/GBChat/${chatId}/messages/${messageId}`,
            places: newPlaces,
            excludedUser,
          });

          Alert.alert(
            t('gbPatrons.toLevelUp'),
            t('gbPatrons.toLevelUpMsg')
          );
          updated = true;
        }
      }

      if (!updated) {
        // 4. Якщо не знайдено — створюємо нове повідомлення
        const places = {};
        places[placeKey] = placeValue;
        const messageData = {
          build: buildId,
          places,
          senderId: userId,
          timestamp: Date.now(),
        };
        // Додаємо excludedUser якщо є
        if (Object.keys(excludedUser).length > 0) {
          messageData.excludedUser = excludedUser;
        }
        
        // НОВИЙ СИНТАКСИС
        await messagesRef.push(messageData);

        console.log('Створено повідомлення для прокачки:', {
          path: `guilds/${guildId}/GBChat/${chatId}/messages`,
          data: messageData,
        });

        Alert.alert(
          t('gbPatrons.toLevelUp'),
          t('gbPatrons.toLevelUpMsg')
        );
      }
    } catch (err) {
      console.error('Помилка створення/оновлення повідомлення для прокачки:', err);
      Alert.alert(t('gbPatrons.toLevelUp'), t('gbPatrons.toLevelUpMsg'));
    }
  };

  useEffect(() => {
    // Логування при активації компоненту
    console.log('GBPatrons activated');
    console.log('buildId:', buildId);
    console.log('level:', level);
    console.log('buildAPI:', buildAPI);
    console.log('personalContribution:', personalContribution);
    console.log('refresh:', refresh);
  }, []); // Логування лише при монтуванні

  return (
    <View style={styles.container}>
      <GBPatronCalculator
        placeCosts={placeCosts}
        totalFP={totalFP}
        ownerContribution={ownerContribution}
        distribution={distributionWithLocalInvests}
        onCalculationComplete={handleGuarantorResult}
      />
      <View style={styles.emptyBox}>
        <View style={styles.topRow}>
          <View style={styles.blockOne}>
            <Text style={styles.headerText}>{t('gbPatrons.leftColumnTitle')}</Text>
          </View>
          <ScrollView
            ref={block2ScrollRef}
            horizontal
            style={styles.block2Scroll}
            showsHorizontalScrollIndicator
            onScroll={syncHorizontalScroll}
            scrollEventThrottle={48}
          >
            {columnTitles.map((title, idx) => (
              <View key={`header-${idx}`} style={[styles.block2Item, { width: columnWidths[idx] }]}>
                <Text style={styles.headerText}>{title}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.bottomRow}>
          
          <ScrollView
            style={[styles.block3Scroll, { width: BLOCK_ONE_WIDTH, flexGrow: 0, overflow: 'hidden', height: containerHeight }]}
            ref={block3ScrollRef}
            showsVerticalScrollIndicator
            scrollEnabled={verticalScrollEnabled}
            onScroll={syncVerticalScroll}
            scrollEventThrottle={48}
          >
            <View style={{ width: BLOCK_ONE_WIDTH, alignItems: 'center' }}>
              {new Array(numRows).fill(0).map((_, rIndex) => (
                <React.Fragment key={`leftFrag-${rIndex}`}>
                  {rIndex === 5 && (
                    <View
                      style={{
                        width: BLOCK_ONE_WIDTH,
                        height: 3,
                        backgroundColor: '#2a2f3a',
                        marginBottom: 2,
                      }}
                    />
                  )}
                  <View
                    key={`leftCol-${rIndex}`}
                    style={{
                      width: BLOCK_ONE_WIDTH,
                      height: rowHeight,
                      borderRightWidth: 1,
                      borderRightColor: '#2a2f3a',
                      borderTopWidth: 1,
                      borderTopColor: '#2a2f3a',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={styles.tableText}>{rIndex + 1}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </ScrollView>

          
          <View style={styles.block4Container}>
            <ScrollView
              ref={block4HorizontalScrollRef}
              horizontal
              style={[styles.block4OuterScroll, { height: containerHeight }]}
              showsHorizontalScrollIndicator
              onScroll={syncHorizontalScroll}
              scrollEventThrottle={48}
            >
              <View style={{ minWidth: columnWidths.reduce((a, b) => a + b, 0) }}>
                <ScrollView
                  style={[styles.block4InnerScroll, { height: containerHeight }]}
                  ref={block4VerticalScrollRef}
                  showsVerticalScrollIndicator
                  scrollEnabled={verticalScrollEnabled}
                  onScroll={syncVerticalScroll}
                  scrollEventThrottle={48}
                >
                  <View>
                    {new Array(numRows).fill(0).map((_, rowIndex) => {
                      const isGuaranteed =
                        guarArray[rowIndex] !== undefined &&
                        guarArray[rowIndex] <= 0 &&
                        distributionWithLocalInvests[rowIndex] &&
                        distributionWithLocalInvests[rowIndex].patronId;
                      const isFreeGuaranteed =
                        guarArray[rowIndex] !== undefined &&
                        guarArray[rowIndex] <= 0 &&
                        (!distributionWithLocalInvests[rowIndex] ||
                          !distributionWithLocalInvests[rowIndex].patronId);

                      return (
                        <React.Fragment key={`frag-${rowIndex}`}>
                          {rowIndex === 5 && (
                            <View
                              style={{
                                height: 3,
                                backgroundColor: '#2a2f3a',
                                width: columnWidths.reduce((a, b) => a + b, 0),
                                marginBottom: 2,
                              }}
                            />
                          )}
                          <View
                            key={`tableRow-${rowIndex}`}
                            style={{
                              flexDirection: 'row',
                              backgroundColor: isGuaranteed ? '#214a33' : undefined,
                            }}
                          >
                            {columnWidths.map((cw, colIndex) => {
                              let cellContent = '';
                              if (colIndex === 0) {
                                if (distributionWithLocalInvests[rowIndex]) {
                                  cellContent =
                                    distributionWithLocalInvests[rowIndex].patronId === 'stranger' || distributionWithLocalInvests[rowIndex].patronId === 'friend'
                                      ? distributionWithLocalInvests[rowIndex].userName
                                      : `${distributionWithLocalInvests[rowIndex].userName}`;
                                } else {
                                  cellContent = t('gbPatrons.none');
                                }
                              } else if (colIndex === 1) {
                                // Степпер для вкладника
                                const row = distributionWithLocalInvests[rowIndex];
                                if (row && row.recordId) {
                                  cellContent = (
                                    <Stepper
                                      value={localInvests[row.recordId] ?? row.invest}
                                      onValueChange={val => handleStepperChange(row.recordId, val)}
                                      buttonSize={20}
                                      minValue={0}
                                      maxValue={200000}
                                    />
                                  );
                                } else {
                                  cellContent = '-';
                                }
                              } else if (colIndex === 2) {
                                const costVal = placeCosts[rowIndex];
                                cellContent = costVal !== undefined ? String(costVal) : '-';
                              } else if (colIndex === 3) {
                                // Якщо місце не зайняте і гарантовано, показати кнопку
                                if (isFreeGuaranteed) {
                                  cellContent = (
                                    <TouchableOpacity
                                      style={{
                                        backgroundColor: '#2f7de1',
                                        borderRadius: 6,
                                        paddingVertical: 4,
                                        paddingHorizontal: 8,
                                      }}
                                      onPress={() => handleToLevelUpPress(rowIndex)}
                                    >
                                      <Text style={{ color: '#fff', fontSize: 13 }}>
                                        {t('gbPatrons.toLevelUp')}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                } else if (
                                  guarArray[rowIndex] !== undefined &&
                                  guarArray[rowIndex] <= 0 &&
                                  distributionWithLocalInvests[rowIndex] &&
                                  distributionWithLocalInvests[rowIndex].patronId
                                ) {
                                  cellContent = t('gbPatrons.guaranteed') || 'Гарантовано';
                                } else {
                                  cellContent = guarArray[rowIndex] !== undefined ? String(guarArray[rowIndex]) : '-';
                                }
                              } else if (colIndex === 4) {
                                cellContent = rowIndex > 4 ? '-' : (() => {
                                  const DEFAULT_COEFFICIENT = 1.900;
                                  const coeff = placeMultipliers[rowIndex] != null
                                    ? placeMultipliers[rowIndex]
                                    : DEFAULT_COEFFICIENT;
                                  return coeff.toFixed(3);
                                })();
                              }
                              return (
                                <View
                                  key={`cell-${rowIndex}-${colIndex}`}
                                  style={{
                                    width: cw,
                                    height: rowHeight,
                                    borderLeftWidth: 1,
                                    borderLeftColor: '#2a2f3a',
                                    borderTopWidth: 1,
                                    borderTopColor: '#2a2f3a',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                  }}
                                >
                                  {typeof cellContent === 'string' || typeof cellContent === 'number'
                                    ? <Text style={styles.tableText}>{cellContent}</Text>
                                    : cellContent}
                                </View>
                              );
                            })}
                          </View>
                        </React.Fragment>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
};

// Локальний Stepper для цього файлу
const Stepper = ({ value, onValueChange, buttonSize = 20, minValue = 0, maxValue = 200000 }) => {
  const [inputValue, setInputValue] = useState(String(value));

  const handleIncrement = () => {
    const newValue = Math.min(Number(value) + 1, maxValue);
    onValueChange(newValue);
    setInputValue(String(newValue));
  };

  const handleDecrement = () => {
    const newValue = Math.max(Number(value) - 1, minValue);
    onValueChange(newValue);
    setInputValue(String(newValue));
  };

  const handleInputChange = text => {
    if (/^\d*$/.test(text)) {
      setInputValue(text);
    }
  };

  const handleEndEditing = () => {
    let newValue = parseInt(inputValue, 10);
    if (isNaN(newValue)) newValue = minValue;
    else if (newValue > maxValue) newValue = maxValue;
    else if (newValue < minValue) newValue = minValue;
    onValueChange(newValue);
    setInputValue(String(newValue));
  };

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#4ea1ff',
      borderRadius: 4,
      overflow: 'hidden',
      paddingHorizontal: 0,
      height: buttonSize, // Висота рамки = висота кнопки
      
    }}>
      <TouchableOpacity
        onPress={handleDecrement}
        style={{
          backgroundColor: '#2f7de1',
          width: buttonSize,
          height: buttonSize,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12 }}>-</Text>
      </TouchableOpacity>
      <TextInput
        style={{
          fontSize: 14,
          textAlign: 'center',
          width: 40,
          height: buttonSize,
          paddingVertical: 0,
          paddingHorizontal: 0,
          borderWidth: 0,
          backgroundColor: '#0f1115',
          color: '#e6e9ef',
        }}
        keyboardType="numeric"
        value={inputValue}
        onChangeText={handleInputChange}
        onEndEditing={handleEndEditing}
        maxLength={String(maxValue).length}
      />
      <TouchableOpacity
        onPress={handleIncrement}
        style={{
          backgroundColor: '#2f7de1',
          width: buttonSize,
          height: buttonSize,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

// Допоміжна функція для обчислення суми елементів масиву
function sumArray(arr) {
  return arr.reduce((acc, val) => acc + val, 0);
}

// Стили остаются без изменений
const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  emptyBox: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#1b1f2a',
    borderWidth: 1,
    borderColor: '#2a2f3a',
    padding: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockOne: {
    width: BLOCK_ONE_WIDTH,
    borderRightWidth: 1,
    borderRightColor: '#2a2f3a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2f3a',
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  block2Scroll: {
    flex: 1,
  },
  block2Item: {
    borderLeftWidth: 1,
    borderLeftColor: '#2a2f3a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2f3a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  block3Scroll: {
    // inline styles задаються через контейнер
  },
  block4Container: {
    flex: 1,
  },
  block4OuterScroll: {
    // inline styles
  },
  block4InnerScroll: {
    // inline styles
  },
  headerText: {
    color: '#e6e9ef',
    fontWeight: '600',
  },
  tableText: {
    color: '#e6e9ef',
  },
});

export default GBPatrons;
