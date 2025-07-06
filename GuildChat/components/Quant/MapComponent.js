import React, { useState, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GRID_ROWS = 5;
const GRID_COLS = 5;
const SQUARE_SIZE = 60;

export default function MapComponent() {
  const [activeArrow, setActiveArrow] = useState(null); // 'up' | 'down' | 'left' | 'right'

  const position = useRef(new Animated.ValueXY()).current;

  const handleTap = (nativeEvent) => {
    if (!activeArrow) return;
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
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          handleTap(evt.nativeEvent);
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        {['up', 'down', 'left', 'right'].map(dir => (
          <TouchableOpacity
            key={dir}
            onPress={() =>
              setActiveArrow(activeArrow === dir ? null : dir)
            }
            style={styles.arrowButton}
          >
            <Ionicons
              name={`arrow-${dir}`}
              size={28}
              color={activeArrow === dir ? '#0066CC' : '#999'}
            />
          </TouchableOpacity>
        ))}
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.imageWrapper, position.getLayout()]}
      >
        <Image
          source={require('../menu-icon.png')}
          style={{ width: GRID_COLS * SQUARE_SIZE, height: GRID_ROWS * SQUARE_SIZE }}
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: GRID_ROWS }).map((_, row) => (
            <View key={row} style={{ flexDirection: 'row', flex: 1 }}>
              {Array.from({ length: GRID_COLS }).map((_, col) => (
                <View key={col} style={styles.gridSquare} />
              ))}
            </View>
          ))}
        </View>
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
  arrowButton: {
    marginHorizontal: 10,
  },
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridSquare: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.2)',
  },
});
