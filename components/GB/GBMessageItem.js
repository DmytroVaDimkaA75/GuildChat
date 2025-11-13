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
    borderBottomColor: '#ddd',
  },
  messageText: {
    fontSize: 16,
  },
});

export default GBMessageItem;
