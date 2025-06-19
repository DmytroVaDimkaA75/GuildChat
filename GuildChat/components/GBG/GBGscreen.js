import React from "react";
import { View, StyleSheet, Alert, Dimensions } from "react-native";
import Svg, { G, Path, SvgXml } from "react-native-svg";
import fullMapSvg from "./fullMapSvg";

// Компонент інтерактивної карти режиму GBG

const { height } = Dimensions.get('window');
const HALF_HEIGHT = height * 0.5;

const SVG_WIDTH = 138.53601;
const SVG_HEIGHT = 164.52901;


const GVG = () => {
  const handleShapePress = (id) => {
    Alert.alert("ID фігури", id);
  };

  return (
    <View style={styles.win}>
      <View style={styles.mapContainer}>
        <SvgXml
          xml={fullMapSvg}
          width="100%"
          height="100%"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  win: {
    flex: 1,
    width: "100%",
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: "white",
  },
  mapContainer: {
    height: HALF_HEIGHT,
    width: "100%",
    backgroundColor: "#f0f0f0",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default GVG;
