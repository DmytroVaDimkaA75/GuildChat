import React from "react";
import { View, StyleSheet, Alert, Dimensions } from "react-native";
import Svg, { Polygon, Text } from "react-native-svg";

const { height } = Dimensions.get('window');
const HALF_HEIGHT = height * 0.5;

const SVG_WIDTH = 138.53601;
const SVG_HEIGHT = 164.52901;

const polygons1 = [
  {
    id: "C5D",
    points: "50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397",
    fill: "#0000ff",
    stroke: "#ffffff",
    strokeWidth: 2,
    strokeOpacity: 0,
    transform: "matrix(0,0.24307514,-0.24307514,0,97.064157,134.0936)",
    label: "C5D",
    labelX: 77.039581,
    labelY: 148.77287,
  },
  // ...далі інші полігони...
];

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
          {polygons1.map((poly) => (
            <React.Fragment key={poly.id}>
              <Polygon
                points={poly.points}
                fill={poly.fill}
                stroke={poly.stroke}
                strokeWidth={poly.strokeWidth}
                strokeOpacity={poly.strokeOpacity}
                transform={poly.transform}
                onPress={() => handleShapePress(poly.id)}
              />
              <Text
                x={poly.labelX}
                y={poly.labelY}
                fontSize={7.05587}
                fontFamily="Arial"
                fill="#000000"
                stroke="#131313"
                strokeWidth={0}
                opacity={1}
                pointerEvents="none"
              >
                {poly.label}
              </Text>
            </React.Fragment>
          ))}
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
