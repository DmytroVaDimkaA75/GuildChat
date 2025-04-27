import React, { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet } from 'react-native';
import { callAssistant } from '../../assistantApi'; // Імпорт функції, яку ми щойно створили

export default function AssistantTestScreen() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');

  const handleSend = async () => {
    const reply = await callAssistant(input);
    setResponse(reply);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Введи запит..."
        value={input}
        onChangeText={setInput}
      />
      <Button title="Відправити запит" onPress={handleSend} />
      <Text style={styles.response}>{response}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  input: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  response: {
    marginTop: 20,
    fontSize: 16,
  },
});
