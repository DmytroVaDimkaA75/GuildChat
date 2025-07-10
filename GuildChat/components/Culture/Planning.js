import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const Planning = () => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={() => {}}>
        <Text style={styles.buttonText}>Існуючі будівлі</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  button: { backgroundColor: '#2196f3', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 4 },
  buttonText: { color: '#fff' }
});

export default Planning;
