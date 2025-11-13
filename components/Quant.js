import React from "react";
import { View, Text, StyleSheet } from "react-native";

const Quant = () => {
  return (
    <View style={styles.win}>
      <Text style={styles.text}>Quant</Text>
     
      
    </View>
  );
};

const styles = StyleSheet.create({

  text: {
    fontSize: 18,
    color: "black",
    fontWeight: "bold",
  },
  win: {
top: 100,
  },
});

export default Quant;