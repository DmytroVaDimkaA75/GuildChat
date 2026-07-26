import React from "react";
import { View, Text, StyleSheet } from "react-native";

const GVG = () => {
  return (
    <View style={styles.win}>
      <Text style={styles.text}>Поле битви</Text>
    
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
    marginTop: 100,
    flex: 1,
    width: "100%",
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: "#0f1115",
  },
});

export default GVG;
