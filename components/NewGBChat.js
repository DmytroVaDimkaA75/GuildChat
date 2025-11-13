import { Picker } from '@react-native-picker/picker'; // ИСПРАВЛЕНО: Правильный импорт Picker
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'; // Добавил View и StyleSheet
// ИСПРАВЛЕНО: Правильные импорты для React Native
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';

const NewGBChat = ({ navigation }) => {
  const [chatName, setChatName] = useState('');
  const [nodeComparison, setNodeComparison] = useState('more');
  const [nodeRatio, setNodeRatio] = useState('');
  const [levelThreshold, setLevelThreshold] = useState('');
  const [allowedGBs, setAllowedGBs] = useState([]);
  const [placeLimit, setPlaceLimit] = useState([1, 2, 3]);
  const [contributionMultiplier, setContributionMultiplier] = useState('');

  const handleCreateChat = async () => {
    // ИСПРАВЛЕНО: Получаем пользователя напрямую
    const user = auth().currentUser;

    if (user) {
      // ИСПРАВЛЕНО: Используем синтаксис для @react-native-firebase
      const chatRef = database().ref('chats');
      const newChatRef = chatRef.push(); // .push() вызывается на ссылке

      const newChat = {
        chatName,
        rules: {
          nodeComparison,
          nodeRatio: parseFloat(nodeRatio) || 0,
          levelThreshold: parseInt(levelThreshold) || 0,
          allowedGBs,
          placeLimit,
          contributionMultiplier: parseFloat(contributionMultiplier) || 0
        },
        createdBy: user.uid
      };

      try {
        await newChatRef.set(newChat); // .set() вызывается на новой ссылке
        console.log('Новий чат створено:', newChat);
        navigation.goBack();
      } catch (error) {
        console.error('Помилка створення чату:', error);
      }
    } else {
      console.log('Користувач не авторизований');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Назва чату (chatName):</Text>
      <TextInput
        value={chatName}
        onChangeText={setChatName}
        placeholder="chatName"
        style={styles.input}
      />

      <Text style={styles.label}>Умова внеску (nodeComparison):</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={nodeComparison}
          onValueChange={(itemValue) => setNodeComparison(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Більше або дорівнює" value="more" />
          <Picker.Item label="Менше або дорівнює" value="less" />
        </Picker>
      </View>

      <Text style={styles.label}>Коефіцієнт внеску (nodeRatio):</Text>
      <TextInput
        value={nodeRatio}
        onChangeText={setNodeRatio}
        placeholder="nodeRatio"
        keyboardType="numeric"
        style={styles.input}
      />

      <Text style={styles.label}>Мінімальний рівень ВС (levelThreshold):</Text>
      <TextInput
        value={levelThreshold}
        onChangeText={setLevelThreshold}
        placeholder="levelThreshold"
        keyboardType="numeric"
        style={styles.input}
      />

      <Text style={styles.label}>Дозволені ВС (allowedGBs):</Text>
      <TextInput
        value={allowedGBs.join(', ')}
        onChangeText={(text) => setAllowedGBs(text.split(',').map(item => item.trim()))} // Добавил .trim() для удаления пробелов
        placeholder="allowedGBs"
        style={styles.input}
      />

      <Text style={styles.label}>Обмеження місць (placeLimit):</Text>
      <TextInput
        value={placeLimit.join(', ')}
        onChangeText={(text) => setPlaceLimit(text.split(',').map(Number))}
        placeholder="placeLimit"
        style={styles.input}
      />

      <Text style={styles.label}>Множник внеску (contributionMultiplier):</Text>
      <TextInput
        value={contributionMultiplier}
        onChangeText={setContributionMultiplier}
        placeholder="contributionMultiplier"
        keyboardType="numeric"
        style={styles.input}
      />

      <Button title="Створити новий чат" onPress={handleCreateChat} />
    </ScrollView>
  );
};

// Добавил стили для лучшего вида
const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  label: {
    marginBottom: 10,
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 20,
    padding: 10,
    borderRadius: 5,
    fontSize: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 20,
  },
  picker: {
    // Стиль для самого Picker может не работать на Android,
    // поэтому мы стилизуем контейнер
  }
});


export default NewGBChat;