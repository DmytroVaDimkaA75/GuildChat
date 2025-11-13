import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const AddSchedule = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [startTime, setStartTime] = useState('23:00');
  const [endTime, setEndTime] = useState('04:40');
  const navigation = useNavigation();
  const toggleSwitch = () => setIsEnabled(previousState => !previousState);

  const daysOfWeek = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];

  const handleSleepSchedule = () => {
    navigation.navigate('SleepSchedule');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Автоматичне ввімкнення</Text>
      <Text style={styles.description}>
        Режим буде автоматично ввімкнено, якщо хоча б одна з умов нижче виконується.
      </Text>
      
           
      <View style={styles.suggestedConditionsContainer}>
        <Text style={styles.suggestedTitle}>Запропоновані умови</Text>
        <TouchableOpacity style={styles.suggestedItem}  onPress={handleSleepSchedule}>
          <Text style={styles.suggestedText}>Час активності</Text>
          <MaterialIcons name="add" size={24} color="green" />
        </TouchableOpacity>
      </View>
      
      
      
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Скасувати</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Готово</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    flex: 1,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#777',
    marginBottom: 10,
  },
  scheduleContainer: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  scheduleTime: {
    fontSize: 14,
    color: '#555',
  },
  scheduleDays: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  suggestedConditionsContainer: {
    marginTop: 10,
  },
  suggestedTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#777',
    marginBottom: 5,
  },
  suggestedItem: {
    backgroundColor: '#FFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  suggestedText: {
    fontSize: 16,
  },
  pickerContainer: {
    backgroundColor: '#FFF',
    padding: 10,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 10,
    width: '45%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
  },
});

export default AddSchedule;
