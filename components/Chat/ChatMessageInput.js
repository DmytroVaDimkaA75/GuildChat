import moment from 'moment-timezone';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DatePicker from 'react-native-date-picker';

const ChatMessageInput = ({ onSendMessage }) => {
  const [message, setMessage] = useState('');
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  
  const handleSendNow = () => {
    if (message.trim()) {
      onSendMessage(message, null);
      setMessage('');
    }
  };

  const handleConfirmSchedule = (date) => {
    setDatePickerVisible(false);
    if (!message.trim()) {
        Alert.alert("Помилка", "Спочатку введіть текст повідомлення.");
        return;
    }

    const scheduledKyivTime = moment.tz(date, "Europe/Kiev");
    const nowInKyiv = moment.tz("Europe/Kiev");

    if (scheduledKyivTime.isBefore(nowInKyiv)) {
      Alert.alert("Невірний час", "Ви не можете запланувати відправку на час, що вже минув.");
      return;
    }

    const utcTimestamp = scheduledKyivTime.valueOf();
    
    onSendMessage(message, utcTimestamp);
    setMessage('');
    Alert.alert("Заплановано", `Ваше повідомлення буде відправлено ${scheduledKyivTime.format('DD.MM.YYYY о HH:mm')}`);
  };

  return (
    <View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Введіть повідомлення..."
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleSendNow}
          onLongPress={() => setDatePickerVisible(true)}
        >
          <Text style={styles.buttonText}>Відправити</Text>
        </TouchableOpacity>
      </View>

      <DatePicker
        modal
        open={isDatePickerVisible}
        date={new Date()}
        onConfirm={handleConfirmSchedule}
        onCancel={() => {
          setDatePickerVisible(false);
        }}
        title="Запланувати відправку"
        confirmText="Підтвердити"
        cancelText="Скасувати"
        minimumDate={new Date()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    backgroundColor: 'white',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
  },
});

export default ChatMessageInput;