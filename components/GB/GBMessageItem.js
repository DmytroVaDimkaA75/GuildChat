import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const GBMessageItem = ({ message }) => {
  return (
    <View style={styles.messageContainer}>
      <Text style={styles.messageText}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2f3a',
    backgroundColor: '#0f1115',
  },
  messageText: {
    fontSize: 16,
    color: '#e6e9ef',
  },
});

export default GBMessageItem;
