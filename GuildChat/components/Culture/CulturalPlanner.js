import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Button,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { database } from '../../firebaseConfig';
import { ref, remove } from 'firebase/database';
import { Ionicons } from '@expo/vector-icons';
import { callAssistant, ASSISTANT_IDS, PROJECT_ID, OPENAI_API_KEY } from '../../assistantApi';

const CulturalPlanner = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const start = route.params?.start;

  // --- Нова логіка чату з ШІ ---
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showObstaclePrompt, setShowObstaclePrompt] = useState(false);

  useEffect(() => {
    if (!start) {
      setShowObstaclePrompt(true);
    } else {
      setShowObstaclePrompt(false);
    }
  }, [start]);

  // Поки не завантажився settlementName, показуємо лоадер
  if (!settlementName) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // При першому mount, якщо start=true, формуємо prompt і відправляємо асистенту
  useEffect(() => {
    if (start) {
      (async () => {
        try {
          const language =
            (await AsyncStorage.getItem('language')) || 'ukrainian';
          const data = { settlement_name: settlementName, language };
          const prompt = `Будь ласка, згенеруй детальний план розвитку культурного поселення на основі цих даних:\n${JSON.stringify(
            data,
            null,
            2
          )}`;

          // Додайте логування для дебагу
          console.log('DEBUG: settlementName:', settlementName);
          console.log('DEBUG: ASSISTANT_IDS:', ASSISTANT_IDS);
          console.log('DEBUG: ASSISTANT_IDS keys:', Object.keys(ASSISTANT_IDS || {}));

          // Додаємо кастомну відповідь у messages
          setMessages([
            {
              role: 'assistant',
              content: `Вітаю в культурному поселенні ${settlementName}!`
            }
          ]);

          // Додаємо перевірку settlementName
          if (!settlementName || !ASSISTANT_IDS?.[settlementName]) {
            console.error('❌ Некоректний settlementName:', settlementName);
            throw new Error('Некоректний settlementName. Виберіть поселення ще раз.');
          }

          // Додайте захист від undefined
          const assistantId = ASSISTANT_IDS?.[settlementName] || ASSISTANT_IDS?.['Поселення1'];
          if (!assistantId) {
            throw new Error('assistantId is undefined. Перевірте ASSISTANT_IDS та settlementName.');
          }

          const reply = await callAssistant(prompt, assistantId);
          //console.log('DEBUG: відповідь від асистента:', reply);

          // Прибрати показ Alert з результатом
          // if (reply && reply.length) {
          //   Alert.alert('Результат планування', reply);
          // } else {
          //   Alert.alert('Помилка', 'Асистент не надав відповіді.');
          // }
        } catch (e) {
          console.error('ERROR при callAssistant:', e);
          Alert.alert('Помилка', e.message);
        }
      })();
    }
  }, [start, settlementName]);

  // Видалити запис у Firebase і повернутися до вибору поселення
  const clearAndBack = async () => {
    const userId = await AsyncStorage.getItem('userId');
    const guildId = await AsyncStorage.getItem('guildId');
    await remove(
      ref(
        database,
        `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`
      )
    );
    navigation.replace('CulturalSettlements');
  };

  // Обробник закриття екрана
  const onClose = () => {
    if (start) {
      clearAndBack();
    } else {
      Alert.alert(
        'Підтвердження',
        'Ви дійсно хочете закінчити планування культурного поселення і видалити весь прогрес?',
        [
          { text: 'Ні' },
          { text: 'Так', onPress: clearAndBack }
        ]
      );
    }
  };

  const handleArrowPress = direction => {
    const text = direction === 'horizontal' ? 'зліва направо' : 'зверху вниз';
    Alert.alert('Напрямок перешкоди', `Ви обрали напрямок ${text}`);
  };

  // Налаштовуємо заголовок і кнопки у шапці
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: `План поселення: ${settlementName}`,
      headerLeft: () => (
        <TouchableOpacity
          onPress={start ? onClose : () => navigation.getParent()?.goBack()}
          style={{ marginLeft: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={onClose} style={{ marginRight: 10 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      )
    });
  }, [navigation, settlementName, start]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setIsLoading(true);

    try {
      // 1. Створити thread, якщо ще не існує
      let currentThreadId = threadId;
      if (!currentThreadId) {
        console.log('[CulturalPlanner] Створення нового thread...');
        const threadRes = await fetch('https://api.openai.com/v1/threads', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`, // <-- використовуємо імпортований ключ
            'OpenAI-Project': PROJECT_ID,
            'OpenAI-Beta': 'assistants=v2',
            'Content-Type': 'application/json'
          },
          body: '{}'
        });
        const threadData = await threadRes.json();
        console.log('[CulturalPlanner] threadRes:', threadData);
        currentThreadId = threadData.id;
        setThreadId(currentThreadId);
        console.log('[CulturalPlanner] Thread створено:', currentThreadId);
      } else {
        console.log('[CulturalPlanner] Використовується існуючий thread:', currentThreadId);
      }

      // 2. Додати повідомлення
      console.log('[CulturalPlanner] Надсилання повідомлення користувача:', input);
      await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'user',
          content: input
        })
      });

      setMessages(prev => [...prev, { role: 'user', content: input }]);
      setInput('');

      // 3. Запустити run
      if (!settlementName || !ASSISTANT_IDS?.[settlementName]) {
        console.log('[CulturalPlanner] Некоректний settlementName:', settlementName);
        Alert.alert('Помилка', 'Некоректний settlementName. Виберіть поселення ще раз.');
        setIsLoading(false);
        return;
      }
      const assistantId = ASSISTANT_IDS[settlementName];
      console.log('[CulturalPlanner] Запуск run для assistantId:', assistantId);

      const runRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assistant_id: assistantId
        })
      });
      const runData = await runRes.json();
      console.log('[CulturalPlanner] runRes:', runData);
      console.log('[CulturalPlanner] Run створено:', runData.id, 'Статус:', runData.status);

      // 4. Очікувати завершення (з таймаутом)
      let runStatus = runData.status;
      let waited = 0;
      const maxWait = 30000; // 30 секунд
      while (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'cancelled' && waited < maxWait) {
        await new Promise(r => setTimeout(r, 2000));
        waited += 2000;
        const check = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${runData.id}`, {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Project': PROJECT_ID,
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        const checkData = await check.json();
        console.log('[CulturalPlanner] checkData:', checkData);
        runStatus = checkData.status;
        console.log(`[CulturalPlanner] Run статус: ${runStatus} (очікування: ${waited / 1000}s)`);
      }
      if (runStatus !== 'completed') {
        console.log('[CulturalPlanner] Run завершився з неуспішним статусом:', runStatus);
        Alert.alert('Помилка', 'Асистент не дав відповідь або сталася помилка.');
        setIsLoading(false);
        return;
      }

      // 5. Отримати відповідь
      console.log('[CulturalPlanner] Отримання відповіді асистента...');
      const msgRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const msgData = await msgRes.json();
      console.log('[CulturalPlanner] msgData:', msgData);
      const last = msgData.data.find(m => m.role === 'assistant');
      if (last) {
        const text = last.content?.[0]?.text?.value || '❌ Помилка';
        console.log('[CulturalPlanner] Відповідь асистента:', text);
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      } else {
        console.log('[CulturalPlanner] Відповідь асистента не знайдена.');
      }
    } catch (e) {
      console.error('[CulturalPlanner] Помилка:', e);
      Alert.alert('Помилка', e.message || 'Щось пішло не так');
    }

    setIsLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Тут логіка планувальника для {settlementName}
      </Text>
      <View style={{flex: 1}}>
        <ScrollView style={styles.chat}>
          {messages.map((m, i) => (
            <Text
              key={i}
              style={m.role === 'user' ? styles.user : styles.assistant}
            >
              {m.role === 'user' ? '🧑‍💬' : '🤖'} {m.content}
            </Text>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Введіть повідомлення"
        />
        <Button
          title={isLoading ? 'Очікуйте...' : 'Надіслати'}
          onPress={sendMessage}
          disabled={isLoading}
        />
        {showObstaclePrompt && (
          <View style={styles.obstaclePrompt}>
            <Text style={styles.obstacleText}>Вкажіть перешкоди на мапі</Text>
            <View style={styles.arrowContainer}>
              <TouchableOpacity onPress={() => handleArrowPress('horizontal')}>
                <Ionicons name="swap-horizontal" size={32} color="#0088cc" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleArrowPress('vertical')} style={{marginLeft: 20}}>
                <Ionicons name="swap-vertical" size={32} color="#0088cc" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chat: { flex: 1, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6', borderRadius: 10, padding: 10, marginVertical: 5 },
  assistant: { alignSelf: 'flex-start', backgroundColor: '#f1f0f0', borderRadius: 10, padding: 10, marginVertical: 5 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, padding: 10, marginBottom: 10 },
  obstaclePrompt: { alignItems: 'center', marginTop: 20 },
  obstacleText: { fontSize: 16, marginBottom: 10 },
  arrowContainer: { flexDirection: 'row' }
});

export default CulturalPlanner;
