import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const Stepper = ({ initialValue = 0, step = 1, maxValue = Infinity, buildId, onValueChange }) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleIncrement = () => {
    if (value + step <= maxValue) {
      const newValue = value + step;
      setValue(newValue);
      onValueChange(buildId, newValue);
    }
  };

  const handleDecrement = () => {
    if (value - step >= 0) {
      const newValue = value - step;
      setValue(newValue);
      onValueChange(buildId, newValue);
    }
  };

  const handleChangeText = (text) => {
    const newValue = parseInt(text, 10);
    if (!isNaN(newValue) && newValue <= maxValue && newValue >= 0) {
      setValue(newValue);
      onValueChange(buildId, newValue);
    }
  };

  return (
    <View style={styles.stepperContainer}>
      <TouchableOpacity onPress={handleDecrement} style={styles.stepButton}>
        <Text style={styles.stepButtonText}>-</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.valueInput}
        keyboardType="numeric"
        value={String(value)}
        onChangeText={handleChangeText}
      />
      <TouchableOpacity onPress={handleIncrement} style={styles.stepButton}>
        <Text style={styles.stepButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4ea1ff',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stepButton: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4ea1ff',
  },
  stepButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  valueInput: {
    width: 50,
    height: 20,
    textAlign: 'center',
    backgroundColor: '#152330',
    borderColor: '#4ea1ff',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    fontSize: 10,
    color: '#f4f7fb',
  },
});

export default Stepper;
