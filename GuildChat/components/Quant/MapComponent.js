import React, { useState, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Switch,
  Animated,
  PanResponder,
} from 'react-native';

const GRID_ROWS = 5;
const GRID_COLS = 5;
const SQUARE_SIZE = 60;
const TAP_MOVE_THRESHOLD = 5; // Максимальне зміщення, яке вважається тапом

export default function MapComponent() {
  const [up, setUp] = useState(false);
  const [down, setDown] = useState(false);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);

  const position = useRef(new Animated.ValueXY()).current;

  const handleTap = (nativeEvent) => {
    if (!(up || down || left || right)) return;
    const { locationX, locationY } = nativeEvent;
    const col = Math.floor(locationX / SQUARE_SIZE);
    const row = Math.floor(locationY / SQUARE_SIZE);
    const id = `square_${row}_${col}`;
    console.log('Tapped square id:', id);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.setOffset({ x: position.x._value, y: position.y._value });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        position.flattenOffset();
        if (
          Math.abs(gestureState.dx) < TAP_MOVE_THRESHOLD &&
          Math.abs(gestureState.dy) < TAP_MOVE_THRESHOLD
        ) {
          handleTap(evt.nativeEvent);
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <Switch value={up} onValueChange={setUp} />
        <Switch value={down} onValueChange={setDown} />
        <Switch value={left} onValueChange={setLeft} />
        <Switch value={right} onValueChange={setRight} />
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.imageWrapper, position.getLayout()]}
      >
        <Image
          source={require('../menu-icon.png')}
          style={{ width: GRID_COLS * SQUARE_SIZE, height: GRID_ROWS * SQUARE_SIZE }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
