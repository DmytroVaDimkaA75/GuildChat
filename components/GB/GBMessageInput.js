import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

const GBMessageInput = ({ onSendMessage }) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.input}
        placeholder="Введіть повідомлення..."
        placeholderTextColor="#9aa3b2"
        value={message}
        onChangeText={setMessage}
      />
      <TouchableOpacity style={styles.button} onPress={handleSend}>
        <Text style={styles.buttonText}>Відправити</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#1b2b3b',
    backgroundColor: '#0f1115',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1b2b3b',
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
    backgroundColor: '#152330',
    color: '#e6e9ef',
  },
  button: {
    backgroundColor: '#4ea1ff',
    padding: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default GBMessageInput;
