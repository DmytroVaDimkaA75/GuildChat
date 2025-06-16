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
          <G id="gA4A">
            <Polygon
              id="A4A"
              onPress={() => handleShapePress('A4A')}
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
          <G id="gA5A">
            <Polygon
              id="A5A"
              onPress={() => handleShapePress('A5A')}
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
          <G id="gA5B">
            <Polygon
              id="A5B"
              onPress={() => handleShapePress('A5B')}
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
          <G id="gC5D">
            <Polygon
              id="C5D"
              onPress={() => handleShapePress('C5D')}
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
          <G id="gD5A">
            <Polygon
              id="D5A"
              onPress={() => handleShapePress('D5A')}
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
          <G id="gA3A">
            <Polygon
              id="A3A"
              onPress={() => handleShapePress('A3A')}
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
          <G id="gA2A">
            <Polygon
              id="A2A"
              onPress={() => handleShapePress('A2A')}
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
          <G id="gX1X">
            <Polygon
              id="X1X"
              onPress={() => handleShapePress('X1X')}
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
          <G id="gD2A">
            <Polygon
              id="D2A"
              onPress={() => handleShapePress('D2A')}
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
          <G id="gD3A">
            <Polygon
              id="D3A"
              onPress={() => handleShapePress('D3A')}
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
          <G id="gD4A">
            <Polygon
              id="D4A"
              onPress={() => handleShapePress('D4A')}
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
          <G id="gA4B">
            <Polygon
              id="A4B"
              onPress={() => handleShapePress('A4B')}
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
          <G id="gA3B">
            <Polygon
              id="A3B"
              onPress={() => handleShapePress('A3B')}
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
          <G id="gB2A">
            <Polygon
              id="B2A"
              onPress={() => handleShapePress('B2A')}
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
          <G id="gC2A">
            <Polygon
              id="C2A"
              onPress={() => handleShapePress('C2A')}
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
          <G id="gC3B">
            <Polygon
              id="C3B"
              onPress={() => handleShapePress('C3B')}
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
          <G id="gC4C">
            <Polygon
              id="C4C"
              onPress={() => handleShapePress('C4C')}
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
          <G id="gA5C">
            <Polygon
              id="A5C"
              onPress={() => handleShapePress('A5C')}
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
          <G id="gA4C">
            <Polygon
              id="A4C"
              onPress={() => handleShapePress('A4C')}
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
          <G id="gB3A">
            <Polygon
              id="B3A"
              onPress={() => handleShapePress('B3A')}
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
          <G id="gB3B">
            <Polygon
              id="B3B"
              onPress={() => handleShapePress('B3B')}
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
          <G id="gC3A">
            <Polygon
              id="C3A"
              onPress={() => handleShapePress('C3A')}
              points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 "
              fill="#94ff00"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,88.390598)"
            />
            <Text
              id="tC3A"
              x={91.857758}
              y={103.06917}
              fontSize={7.05539}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C3A
            </Text>
          </G>
          <G id="gC4B">
            <Polygon
              id="C4B"
              onPress={() => handleShapePress('C4B')}
              points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
              fill="#6161fa"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,106.6716)"
            />
            <Text
              id="tC4B"
              x={92.052864}
              y={121.34898}
              fontSize={7.05546}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C4B
            </Text>
          </G>
          <G id="gC5C">
            <Polygon
              id="C5C"
              onPress={() => handleShapePress('C5C')}
              points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
              fill="#0000ff"
              fillOpacity={1}
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,111.88149,124.9526)"
            />
            <Text
              id="tC5C"
              x={91.80899}
              y={139.63106}
              fontSize={7.05553}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
              C5C
            </Text>
          </G>
          <G id="gA5D">
            <Polygon
              id="A5D"
              onPress={() => handleShapePress('A5D')}
              points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 "
              fill="#0000ff"
              stroke="#ffffff"
              strokeWidth={2}
              strokeOpacity={0}
              display="inline"
              transform="matrix(0,0.24307514,-0.24307514,0,126.69849,24.406597)"
            />
            <Text
              id="tA5D"
              x={107.04973}
              y={39.042854}
              fontSize={7.05605}
              fontFamily="Arial"
              fill="#000000"
              stroke="#131313"
              strokeWidth={0}
              pointerEvents="none"
            >
            A5D
          </Text>
        </G>
        <G id="gB4A">
          <Polygon
            id="B4A"
            onPress={() => handleShapePress('B4A')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,126.69849,42.687597)"
          />
          <Text
            id="tB4A"
            x={106.78522}
            y={57.368034}
            fontSize={7.05637}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B4A
          </Text>
        </G>
        <G id="gB4B">
          <Polygon
            id="B4B"
            onPress={() => handleShapePress('B4B')}
            points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,126.69849,60.968596)"
          />
          <Text
            id="tB4B"
            x={106.9789}
            y={75.648445}
            fontSize={7.05565}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B4B
          </Text>
        </G>
        <G id="gB4C">
          <Polygon
            id="B4C"
            onPress={() => handleShapePress('B4C')}
            points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,126.69849,79.249598)"
          />
          <Text
            id="tB4C"
            x={106.7391}
            y={93.927223}
            fontSize={7.05575}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B4C
          </Text>
        </G>
        <G id="gC4A">
          <Polygon
            id="C4A"
            onPress={() => handleShapePress('C4A')}
            points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,126.69849,97.530597)"
          />
          <Text
            id="tC4A"
            x={106.67642}
            y={112.20878}
            fontSize={7.05551}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            C4A
          </Text>
        </G>
        <G id="gC5B">
          <Polygon
            id="C5B"
            onPress={() => handleShapePress('C5B')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,126.69849,115.8116)"
          />
          <Text
            id="tC5B"
            x={106.87006}
            y={130.48888}
            fontSize={7.05546}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            C5B
          </Text>
        </G>
        <G id="gB5A">
          <Polygon
            id="B5A"
            onPress={() => handleShapePress('B5A')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#0000ff"
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,141.51549,33.546598)"
          />
          <Text
            id="tB5A"
            x={121.60201}
            y={48.183723}
            fontSize={7.05618}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B5A
          </Text>
        </G>
        <G id="gB5B">
          <Polygon
            id="B5B"
            onPress={() => handleShapePress('B5B')}
            points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,141.51549,51.827597)"
          />
          <Text
            id="tB5B"
            x={121.79572}
            y={66.464333}
            fontSize={7.05565}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B5B
          </Text>
        </G>
        <G id="gB5C">
          <Polygon
            id="B5C"
            onPress={() => handleShapePress('B5C')}
            points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,141.51549,70.108596)"
          />
          <Text
            id="tB5C"
            x={121.55735}
            y={84.786385}
            fontSize={7.05575}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B5C
          </Text>
        </G>
        <G id="gB5D">
          <Polygon
            id="B5D"
            onPress={() => handleShapePress('B5D')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,141.51549,88.389598)"
          />
          <Text
            id="tB5D"
            x={121.60318}
            y={103.02584}
            fontSize={7.05605}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B5D
          </Text>
        </G>
        <G id="g36">
          <Polygon
            id="polygon13"
            onPress={() => handleShapePress('polygon13')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,141.51549,106.6706)"
          />
          <Text
            id="text36"
            x={121.60274}
            y={121.30651}
            fontSize={7.05556}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            B5D
          </Text>
        </G>
        <G id="gF5D">
          <Polygon
            id="F5D"
            onPress={() => handleShapePress('F5D')}
            points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 "
            fill="#0000ff"
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,67.430483,6.1265975)"
          />
          <Text
            id="tF5D"
            x={47.684811}
            y={20.76269}
            fontSize={7.05562}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F5D
          </Text>
        </G>
        <G id="gF4C">
          <Polygon
            id="F4C"
            onPress={() => handleShapePress('F4C')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,67.430481,24.407549)"
          />
          <Text
            id="tF4C"
            x={47.636696}
            y={39.086468}
            fontSize={7.0558}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F4C
          </Text>
        </G>
        <G id="gF3B">
          <Polygon
            id="F3B"
            onPress={() => handleShapePress('F3B')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#94ff00"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,67.430481,42.68855)"
          />
          <Text
            id="tF3B"
            x={47.881199}
            y={57.332249}
            fontSize={7.05575}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F3B
          </Text>
        </G>
        <G id="gF2A">
          <Polygon
            id="F2A"
            onPress={() => handleShapePress('F2A')}
            points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 "
            fill="#0064ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,67.430481,60.969549)"
          />
          <Text
            id="tF2A"
            x={47.68705}
            y={75.659302}
            fontSize={7.05533}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F2A
          </Text>
        </G>
        <G id="gE2A">
          <Polygon
            id="E2A"
            onPress={() => handleShapePress('E2A')}
            points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 "
            fill="#0064ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,67.430481,79.250548)"
          />
          <Text
            id="tE2A"
            x={47.499283}
            y={93.939438}
            fontSize={7.0555}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E2A
          </Text>
        </G>
        <G id="gD3B">
          <Polygon
            id="D3B"
            onPress={() => handleShapePress('D3B')}
            points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
            fill="#94ff00"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,67.430481,97.531547)"
          />
          <Text
            id="tD3B"
            x={47.504944}
            y={112.17458}
            fontSize={7.05578}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            D3B
          </Text>
        </G>
        <G id="gD4B">
          <Polygon
            id="D4B"
            onPress={() => handleShapePress('D4B')}
            points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,67.430481,115.81255)"
          />
          <Text
            id="tD4B"
            x={47.50412}
            y={130.492}
            fontSize={7.05624}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            D4B
          </Text>
        </G>
        <G id="gD5B">
          <Polygon
            id="D5B"
            onPress={() => handleShapePress('D5B')}
            points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24041965,-0.24041571,0,67.179072,134.12651)"
          />
          <Text
            id="tD5B"
            x={47.503651}
            y={148.72986}
            fontSize={7.05605}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            D5B
          </Text>
        </G>
        <G id="gF5C">
          <Polygon
            id="F5C"
            onPress={() => handleShapePress('F5C')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#0000ff"
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,52.613483,15.266597)"
          />
          <Text
            id="tF5C"
            x={32.819206}
            y={29.945866}
            fontSize={7.05587}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F5C
          </Text>
        </G>
        <G id="gF4B">
          <Polygon
            id="F4B"
            onPress={() => handleShapePress('F4B')}
            points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,52.613481,33.54755)"
          />
          <Text
            id="tF4B"
            x={33.062668}
            y={48.227001}
            fontSize={7.05624}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F4B
          </Text>
        </G>
        <G id="gF3A">
          <Polygon
            id="F3A"
            onPress={() => handleShapePress('F3A')}
            points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 "
            fill="#94ff00"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,52.613481,51.828549)"
          />
          <Text
            id="tF3A"
            x={32.869705}
            y={66.473419}
            fontSize={7.05589}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F3A
          </Text>
        </G>
        <G id="gE3B">
          <Polygon
            id="E3B"
            onPress={() => handleShapePress('E3B')}
            points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
            fill="#94ff00"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,52.613481,70.109548)"
          />
          <Text
            id="tE3B"
            x={32.875378}
            y={84.752975}
            fontSize={7.05546}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E3B
          </Text>
        </G>
        <G id="gE3A">
          <Polygon
            id="E3A"
            onPress={() => handleShapePress('E3A')}
            points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 "
            fill="#94ff00"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,52.613481,88.39055)"
          />
          <Text
            id="tE3A"
            x={32.682163}
            y={103.03514}
            fontSize={7.0555}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E3A
          </Text>
        </G>
        <G id="gD4C">
          <Polygon
            id="D4C"
            onPress={() => handleShapePress('D4C')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,52.613481,106.67155)"
          />
          <Text
            id="tD4C"
            x={32.444893}
            y={121.35084}
            fontSize={7.05587}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            D4C
          </Text>
        </G>
        <G id="gD5C">
          <Polygon
            id="D5C"
            onPress={() => handleShapePress('D5C')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,52.61348,124.95255)"
          />
          <Text
            id="tD5C"
            x={32.444176}
            y={139.63164}
            fontSize={7.05556}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            D5C
          </Text>
        </G>
        <G id="gF5B">
          <Polygon
            id="F5B"
            onPress={() => handleShapePress('F5B')}
            points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 "
            fill="#0000ff"
            stroke="#ffffff"
            strokeWidth={0}
            strokeOpacity={0}
            strokeDasharray="none"
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,37.796483,24.406597)"
          />
          <Text
            id="tF5B"
            x={18.522688}
            y={39.285862}
            fontSize={7.05605}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F5B
          </Text>
        </G>
        <G id="gF4A">
          <Polygon
            id="F4A"
            onPress={() => handleShapePress('F4A')}
            points="13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,37.796481,42.68755)"
          />
          <Text
            id="tF4A"
            x={18.330442}
            y={57.366192}
            fontSize={7.05614}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F4A
          </Text>
        </G>
        <G id="gE4C">
          <Polygon
            id="E4C"
            onPress={() => handleShapePress('E4C')}
            points="13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 50,93.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            display="inline"
            transform="matrix(0,0.24307906,-0.24307508,0,37.796481,60.968549)"
          />
          <Text
            id="tE4C"
            x={18.091955}
            y={75.64785}
            fontSize={7.05587}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E4C
          </Text>
        </G>
        <G id="gE4B">
          <Polygon
            id="E4B"
            onPress={() => handleShapePress('E4B')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,37.796481,79.249548)"
          />
          <Text
            id="tE4B"
            x={18.335117}
            y={93.927666}
            fontSize={7.05614}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E4B
          </Text>
        </G>
        <G id="gE4A">
          <Polygon
            id="E4A"
            onPress={() => handleShapePress('E4A')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#6161fa"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,37.796481,97.530547)"
          />
          <Text
            id="tE4A"
            x={18.142048}
            y={112.20862}
            fontSize={7.0555}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E4A
          </Text>
        </G>
        <G id="gD5D">
          <Polygon
            id="D5D"
            onPress={() => handleShapePress('D5D')}
            points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,37.796481,115.81155)"
          />
          <Text
            id="tD5D"
            x={17.951435}
            y={130.44925}
            fontSize={7.05613}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            D5D
          </Text>
        </G>
        <G id="gF5A">
          <Polygon
            id="F5A"
            onPress={() => handleShapePress('F5A')}
            points="50,13.397 86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 "
            fill="#0000ff"
            stroke="#131313"
            strokeWidth={0.00000058}
            strokeDasharray="none"
            strokeOpacity={0.981482}
            display="inline"
            transform="matrix(0,0.24307514,-0.24307514,0,22.702489,33.546598)"
          />
          <Text
            id="tF5A"
            x={3.2352853}
            y={48.424835}
            fontSize={7.05546}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            F5A
          </Text>
        </G>
        <G id="gE5D">
          <Polygon
            id="E5D"
            onPress={() => handleShapePress('E5D')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,22.97948,51.827549)"
          />
          <Text
            id="tE5D"
            x={3.0458369}
            y={66.464432}
            fontSize={7.05566}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E5D
          </Text>
        </G>
        <G id="gE5C">
          <Polygon
            id="E5C"
            onPress={() => handleShapePress('E5C')}
            points="86.603,33.397 86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,22.97948,70.108548)"
          />
          <Text
            id="tE5C"
            x={2.9979608}
            y={84.785988}
            fontSize={7.05572}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E5C
          </Text>
        </G>
        <G id="gE5B">
          <Polygon
            id="E5B"
            onPress={() => handleShapePress('E5B')}
            points="86.603,73.397 50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,22.97948,88.389549)"
          />
          <Text
            id="tE5B"
            x={3.2410693}
            y={103.0208}
            fontSize={7.05571}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E5B
          </Text>
        </G>
        <G id="gE5A">
          <Polygon
            id="E5A"
            onPress={() => handleShapePress('E5A')}
            points="50,93.397 13.397,73.397 13.397,33.397 50,13.397 86.603,33.397 86.603,73.397 "
            fill="#0000ff"
            fillOpacity={1}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0}
            transform="matrix(0,0.24307906,-0.24307508,0,22.97948,106.67055)"
          />
          <Text
            id="tE5A"
            x={3.0479274}
            y={121.30554}
            fontSize={7.0555}
            fontFamily="Arial"
            fill="#000000"
            stroke="#131313"
            strokeWidth={0}
            pointerEvents="none"
          >
            E5A
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
