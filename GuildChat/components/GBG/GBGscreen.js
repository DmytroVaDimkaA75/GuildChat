import React from "react";
import { View, StyleSheet, Alert, Dimensions } from "react-native";
import Svg, { G, Polygon, Text } from "react-native-svg";

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
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        >
          <G id="gA5A" onPress={() => handleShapePress('A5A')}>
            <Polygon
              id="A5A"
              points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397"
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307514,-0.24307514,0,82.247483,-3.0134026)"
            />
            <Text
              id="tA5A"
              x={62.599854}
              y={11.622864}
              fontSize={7.05605}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A5A
            </Text>
          </G>
        </Svg>
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
