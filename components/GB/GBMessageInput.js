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
    borderTopColor: '#2a2f3a',
    backgroundColor: '#0f1115',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a2f3a',
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
    backgroundColor: '#1b1f2a',
    color: '#e6e9ef',
  },
  button: {
    backgroundColor: '#2f7de1',
    padding: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default GBMessageInput;
