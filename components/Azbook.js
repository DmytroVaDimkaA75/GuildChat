import React from "react";
import { View, Text, StyleSheet } from "react-native";

const Azbook = () => {
  return (
    <View style={styles.win}>
      <Text style={styles.text}>azbook</Text>
      
      
    </View>
  );
};

const styles = StyleSheet.create({

  text: {
    fontSize: 18,
    color: "#f4f7fb",
    fontWeight: "bold",
  },
  win: {
top: 100,
  },
});

export default Azbook;
