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
          <G id="gA4A" onPress={() => handleShapePress('A4A')}>
            <Polygon
              id="A4A"
              points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397"
              fill="#6161fa"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,15.267547)"
            />
            <Text
              id="tA4A"
              x={62.599838}
              y={29.947001}
              fontSize={7.05624}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A4A
            </Text>
          </G>
          <G id="gA5A" onPress={() => handleShapePress('A5A')}>
            <Polygon
              id="A5A"
              points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397"
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,82.247483,-3.0134026)"
            />
            <Text
              id="tA5A"
              x={62.599854}
              y={11.622864}
              fontSize={7.05605}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A5A
            </Text>
          </G>
          <G id="gA5B" onPress={() => handleShapePress('A5B')}>
            <Polygon
              id="A5B"
              points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397"
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,6.1265975)"
            />
            <Text
              id="tA5B"
              x={77.609856}
              y={20.762863}
              fontSize={7.05605}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A5B
            </Text>
          </G>
          <G id="gC5D" onPress={() => handleShapePress('C5D')}>
            <Polygon
              id="C5D"
              points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397"
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307514,-0.24307514,0,97.064157,134.0936)"
            />
            <Text
              id="tC5D"
              x={77.039581}
              y={148.77287}
              fontSize={7.05587}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C5D
            </Text>
          </G>
          <G id="gD5A" onPress={() => handleShapePress('D5A')}>
            <Polygon
              id="D5A"
              points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397"
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.24748,143.23455)"
            />
            <Text
              id="tD5A"
              x={62.127655}
              y={157.87086}
              fontSize={7.05605}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              D5A
            </Text>
          </G>
          <G id="gA3A" onPress={() => handleShapePress('A3A')}>
            <Polygon
              id="A3A"
              points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397"
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,33.548548)"
            />
            <Text
              id="tA3A"
              x={62.59985}
              y={48.19342}
              fontSize={7.05589}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A3A
            </Text>
          </G>
          <G id="gA2A" onPress={() => handleShapePress('A2A')}>
            <Polygon
              id="A2A"
              points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397"
              fill="#0064ff"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,51.829547)"
            />
            <Text
              id="tA2A"
              x={62.598366}
              y={66.521095}
              fontSize={7.05553}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A2A
            </Text>
          </G>
          <G id="gX1X" onPress={() => handleShapePress('X1X')}>
            <Polygon
              id="X1X"
              points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397"
              fill="#ff00ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,70.110546)"
            />
            <Text
              id="tX1X"
              x={62.607426}
              y={84.800148}
              fontSize={7.05551}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              X1X
            </Text>
          </G>
          <G id="gD2A" onPress={() => handleShapePress('D2A')}>
            <Polygon
              id="D2A"
              points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397"
              fill="#0064ff"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,88.391548)"
            />
            <Text
              id="tD2A"
              x={62.128345}
              y={103.08009}
              fontSize={7.05549}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              D2A
            </Text>
          </G>
          <G id="gD3A" onPress={() => handleShapePress('D3A')}>
            <Polygon
              id="D3A"
              points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397"
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,106.67255)"
            />
            <Text
              id="tD3A"
              x={62.127663}
              y={121.31742}
              fontSize={7.05589}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              D3A
            </Text>
          </G>
          <G id="gD4A" onPress={() => handleShapePress('D4A')}>
            <Polygon
              id="D4A"
              points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397"
              fill="#6161fa"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              transform="matrix(0,0.24307906,-0.24307508,0,82.247481,124.95355)"
            />
            <Text
              id="tD4A"
              x={62.126545}
              y={139.63538}
              fontSize={7.05636}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              D4A
            </Text>
          </G>
          <G id="gA4B" onPress={() => handleShapePress('A4B')}>
            <Polygon
              id="A4B"
              points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397"
              fill="#6161fa"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,24.407597)"
            />
            <Text
              id="tA4B"
              x={77.610336}
              y={39.087002}
              fontSize={7.05624}
              fontFamily="Arial"
              fill="#000000"
              fillOpacity={1}
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A4B
            </Text>
          </G>
          <G id="gA3B" onPress={() => handleShapePress('A3B')}>
            <Polygon
              id="A3B"
              points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397"
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,42.688597)"
            />
            <Text
              id="tA3B"
              x={77.609856}
              y={57.33342}
              fontSize={7.05589}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A3B
            </Text>
          </G>
          <G id="gB2A" onPress={() => handleShapePress('B2A')}>
            <Polygon
              id="B2A"
              points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397"
              fill="#0064ff"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,60.969596)"
            />
            <Text
              id="tB2A"
              x={77.150421}
              y={75.661736}
              fontSize={7.05556}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              B2A
            </Text>
          </G>
          <G id="gC2A" onPress={() => handleShapePress('C2A')}>
            <Polygon
              id="C2A"
              points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397"
              fill="#0064ff"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,79.250598)"
            />
            <Text
              id="tC2A"
              x={77.042198}
              y={93.929848}
              fontSize={7.05587}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C2A
            </Text>
          </G>
          <G id="gC3B" onPress={() => handleShapePress('C3B')}>
            <Polygon
              id="C3B"
              points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397"
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,97.531595)"
            />
            <Text
              id="tC3B"
              x={77.234596}
              y={112.20964}
              fontSize={7.05556}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C3B
            </Text>
          </G>
          <G id="gC4C" onPress={() => handleShapePress('C4C')}>
            <Polygon
              id="C4C"
              points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397"
              fill="#6161fa"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,97.064158,115.9126)"
            />
            <Text
              id="tC4C"
              x={76.991928}
              y={130.59109}
              fontSize={7.05553}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C4C
            </Text>
          </G>
          <G id="gA5C" onPress={() => handleShapePress('A5C')}>
            <Polygon
              id="A5C"
              points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397"
              fill="#0000ff"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,15.266597)"
            />
            <Text
              id="tA5C"
              x={92.1828}
              y={29.946138}
              fontSize={7.05568}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A5C
            </Text>
          </G>
          <G id="gA4C" onPress={() => handleShapePress('A4C')}>
            <Polygon
              id="A4C"
              points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397"
              fill="#6161fa"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,33.547598)"
            />
            <Text
              id="tA4C"
              x={92.183838}
              y={48.226639}
              fontSize={7.05556}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              A4C
            </Text>
          </G>
          <G id="gB3A" onPress={() => handleShapePress('B3A')}>
            <Polygon
              id="B3A"
              points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397"
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,51.828597)"
            />
            <Text
              id="tB3A"
              x={91.968552}
              y={66.474609}
              fontSize={7.05602}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              B3A
            </Text>
          </G>
          <G id="gB3B" onPress={() => handleShapePress('B3B')}>
            <Polygon
              id="B3B"
              points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397"
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,70.109596)"
            />
            <Text
              id="tB3B"
              x={92.162086}
              y={84.755226}
              fontSize={7.05565}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              B3B
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
