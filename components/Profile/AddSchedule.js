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
        <TouchableOpacity style={styles.suggestedItem} onPress={handleSleepSchedule}>
          <Text style={styles.suggestedText}>Час активності</Text>
          <MaterialIcons name="add" size={24} color="#3498db" />
        </TouchableOpacity>
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.buttonSecondary}>
          <Text style={styles.buttonTextSecondary}>Скасувати</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonPrimary}>
          <Text style={styles.buttonTextPrimary}>Готово</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#121212',
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E0E0E0',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#9BA1A6',
    marginBottom: 16,
    lineHeight: 20,
  },
  scheduleContainer: {
    backgroundColor: '#1e1e1e',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  scheduleTime: {
    fontSize: 14,
    color: '#C7CDD3',
  },
  scheduleDays: {
    fontSize: 14,
    color: '#C7CDD3',
    marginBottom: 10,
  },
  suggestedConditionsContainer: {
    marginTop: 10,
  },
  suggestedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#A0D8FF',
    marginBottom: 8,
  },
  suggestedItem: {
    backgroundColor: '#1e1e1e',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestedText: {
    fontSize: 16,
    color: '#E0E0E0',
  },
  pickerContainer: {
    backgroundColor: '#1e1e1e',
    padding: 10,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  buttonPrimary: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  buttonSecondary: {
    backgroundColor: '#1e1e1e',
    paddingVertical: 12,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: '#E0E0E0',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default AddSchedule;
