import React, { useRef, useState } from "react";
import { View, StyleSheet, Alert, Dimensions } from "react-native";
import Svg, { G, Polygon, Text, Path } from "react-native-svg";

// Компонент інтерактивної карти режиму GBG

const { height } = Dimensions.get('window');
const HALF_HEIGHT = height * 0.5;

const SVG_WIDTH = 138.53601;
const SVG_HEIGHT = 164.52901;


const GVG = () => {
  const mapRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleLayout = () => {
    mapRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setOffset({ x: pageX, y: pageY });
    });
  };

  const handleShapePress = (id, event) => {
    if (event?.nativeEvent) {
      const { pageX, pageY } = event.nativeEvent;
      const relativeX = pageX - offset.x;
      const relativeY = pageY - offset.y;
      console.log(
        `Координати тапу відносно контейнера: ${relativeX.toFixed(2)}, ${relativeY.toFixed(2)}`,
      );
    }
    Alert.alert("ID фігури", id);
  };

  return (
    <View style={styles.win}>
      <View
        style={styles.mapContainer}
        ref={mapRef}
        onLayout={handleLayout}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        >
            <G onPress={(e) => handleShapePress("C5D", e)}>
            <Path
            id="fC5D"
            onPress={(e) => handleShapePress("C5D", e)}
            style={{
              display: "inline",
              fill: "#0000ff",
              stroke: "#ffffff",
              strokeWidth: 0.48615,
              strokeOpacity: 0,
              
            }}
            d="m 74.361668,146.24736 4.861503,-8.89728 h 9.723006 l 4.861502,8.89728 -4.861502,8.89728 h -9.723006 z"
            />
            <Path
            id="tC5D"
            onPress={(e) => handleShapePress("C5D", e)}
            style={{
              fontSize: 7.05587,
              fontFamily: "Arial",
              stroke: "#131313",
              strokeWidth: 0,
              strokeOpacity: 0.981482,
              fill: "#000000",
            }}
            d="m 81.187661,147.00201 0.668378,0.16882 q -0.21016,0.82342 -0.757954,1.25752 -0.54435,0.43065 -1.333312,0.43065 -0.816524,0 -1.329866,-0.33074 -0.509897,-0.33419 -0.778626,-0.96467 -0.265284,-0.63048 -0.265284,-1.35398 0,-0.78896 0.299736,-1.37466 0.303182,-0.58913 0.857867,-0.89232 0.558131,-0.30662 1.226509,-0.30662 0.757955,0 1.274742,0.38586 0.516788,0.38587 0.720057,1.08526 l -0.658042,0.15503 q -0.175708,-0.55124 -0.509897,-0.80274 -0.334189,-0.2515 -0.840641,-0.2515 -0.582247,0 -0.975005,0.27906 -0.389314,0.27907 -0.547795,0.75107 -0.158481,0.46855 -0.158481,0.96811 0,0.64426 0.186043,1.1266 0.189489,0.47889 0.585692,0.71661 0.396204,0.23772 0.857867,0.23772 0.561576,0 0.950889,-0.32385 0.389313,-0.32385 0.527123,-0.96123 z m 1.24029,0.44789 0.651152,-0.0551 q 0.07235,0.47545 0.334189,0.71662 0.265284,0.23772 0.637371,0.23772 0.447883,0 0.757955,-0.33764 0.310072,-0.33763 0.310072,-0.89576 0,-0.53057 -0.299736,-0.8372 -0.296292,-0.30662 -0.778627,-0.30662 -0.299736,0 -0.540904,0.13781 -0.241167,0.13436 -0.378977,0.35141 l -0.582247,-0.0758 0.489225,-2.59428 h 2.511587 v 0.59259 H 83.52354 l -0.272175,1.35742 q 0.454773,-0.31696 0.954334,-0.31696 0.661488,0 1.116261,0.45822 0.454773,0.45822 0.454773,1.17827 0,0.68561 -0.399649,1.18517 -0.48578,0.61325 -1.326421,0.61325 -0.68905,0 -1.126596,-0.38586 -0.434102,-0.38587 -0.496116,-1.02324 z m 4.175642,1.32297 v -5.05073 h 1.73985 q 0.589138,0 0.89921,0.0724 0.434102,0.0999 0.740729,0.36175 0.399649,0.33763 0.596028,0.86476 0.199824,0.52367 0.199824,1.19894 0,0.57536 -0.134364,1.0198 -0.134365,0.44443 -0.344525,0.73728 -0.21016,0.2894 -0.461664,0.45822 -0.248058,0.16537 -0.602918,0.2515 -0.351416,0.0861 -0.809634,0.0861 z m 0.668378,-0.59603 h 1.078363 q 0.499561,0 0.782071,-0.093 0.285956,-0.093 0.454773,-0.26184 0.237722,-0.23772 0.368642,-0.63737 0.134365,-0.40309 0.134365,-0.975 0,-0.79241 -0.261839,-1.21618 -0.258394,-0.42721 -0.630481,-0.57191 -0.268729,-0.10335 -0.864757,-0.10335 h -1.061137 z"
            />
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
