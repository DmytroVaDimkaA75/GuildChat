// components/FoeSync/FoeLoadingRing.js
//
// Кругова діаграма завантаження: заповнюється відповідно до відсотка готових
// споруд; тонке кільце з крапкою постійно обертається (індикатор роботи).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const SIZE = 104;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function FoeLoadingRing({ pct = 0, label }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ratio = Math.max(0, Math.min(1, Number(pct) / 100));
  const offset = C * (1 - ratio);

  return (
    <View style={styles.wrap}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#243447" strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke="#4ea1ff"
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${C}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>

        <Animated.View
          style={[styles.overlay, { width: SIZE, height: SIZE, transform: [{ rotate }] }]}
          pointerEvents="none"
        >
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={SIZE / 2} cy={STROKE / 2 + 1} r={STROKE / 2 - 1} fill="#8fc4ff" />
          </Svg>
        </Animated.View>

        <View style={[styles.overlay, styles.center, { width: SIZE, height: SIZE }]}>
          <Text style={styles.pct}>{Math.round(ratio * 100)}%</Text>
        </View>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 26 },
  overlay: { position: 'absolute', top: 0, left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pct: { color: '#f4f7fb', fontSize: 22, fontWeight: '800' },
  label: { color: '#9aa3b2', fontSize: 12, marginTop: 12 },
});
