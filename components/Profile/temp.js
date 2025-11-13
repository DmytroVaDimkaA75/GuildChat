import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Svg, { Circle, Text as SvgText, Line } from 'react-native-svg';

const SleepSchedule = () => {
  const { width } = Dimensions.get('window');
  const size = width - 40; // базовий розмір кола
  const strokeWidth = 30;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Мінімальний та максимальний інтервал (в хвилинах)
  const MIN_GAP_MINUTES = 30;
  const MAX_GAP_MINUTES = 23 * 60 + 30;
  const TOTAL_MINUTES = 24 * 60;
  const minArc = MIN_GAP_MINUTES / TOTAL_MINUTES;
  const maxArc = MAX_GAP_MINUTES / TOTAL_MINUTES;

  const [startProgress, setStartProgress] = useState(0.2);
  const [endProgress, setEndProgress] = useState(0.7);
  const [activeHandle, setActiveHandle] = useState(null);

  const startProgressRef = useRef(startProgress);
  const endProgressRef = useRef(endProgress);
  useEffect(() => { startProgressRef.current = startProgress; }, [startProgress]);
  useEffect(() => { endProgressRef.current = endProgress; }, [endProgress]);

  const formatTime = (progress) => {
    const total = Math.round(progress * TOTAL_MINUTES);
    const hh = Math.floor(total / 60).toString().padStart(2, '0');
    const mm = (total % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const getArc = (start, end) => {
    return end >= start ? end - start : 1 - (start - end);
  };

  const arcVal = getArc(startProgress, endProgress);
  const arcAngle = arcVal * 2 * Math.PI;
  const arcLength = arcAngle * radius;
  const strokeDasharray = `${arcLength} ${circumference - arcLength}`;
  const strokeDashoffset = circumference * (0.25 - startProgress);

  const clampProgress = (val) => {
    if (val < 0) return val + 1;
    if (val >= 1) return val - 1;
    return val;
  };

  const threshold = 40;
  const draggingHandleRef = useRef(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const sx = center + radius * Math.cos(2 * Math.PI * startProgressRef.current - Math.PI / 2);
        const sy = center + radius * Math.sin(2 * Math.PI * startProgressRef.current - Math.PI / 2);
        const ex = center + radius * Math.cos(2 * Math.PI * endProgressRef.current - Math.PI / 2);
        const ey = center + radius * Math.sin(2 * Math.PI * endProgressRef.current - Math.PI / 2);
        const distToStart = Math.hypot(locationX - sx, locationY - sy);
        const distToEnd = Math.hypot(locationX - ex, locationY - ey);
        if (distToStart <= threshold && distToStart <= distToEnd) {
          draggingHandleRef.current = 'start';
          setActiveHandle('start');
        } else if (distToEnd <= threshold) {
          draggingHandleRef.current = 'end';
          setActiveHandle('end');
        } else {
          draggingHandleRef.current = null;
          setActiveHandle(null);
        }
      },

      onPanResponderMove: (evt) => {
        if (!draggingHandleRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        let angle = Math.atan2(locationY - center, locationX - center);
        let newAngle = angle + Math.PI / 2;
        if (newAngle < 0) newAngle += 2 * Math.PI;
        const proposedProgress = clampProgress(newAngle / (2 * Math.PI));
        if (draggingHandleRef.current === 'start') {
          const newArc = getArc(proposedProgress, endProgressRef.current);
          if (newArc < minArc || newArc > maxArc) return;
          setStartProgress(proposedProgress);
        } else {
          const newArc = getArc(startProgressRef.current, proposedProgress);
          if (newArc < minArc || newArc > maxArc) return;
          setEndProgress(proposedProgress);
        }
      },

      onPanResponderRelease: () => {
        draggingHandleRef.current = null;
        setActiveHandle(null);
      },
      onPanResponderTerminate: () => {
        draggingHandleRef.current = null;
        setActiveHandle(null);
      },
    })
  ).current;

  // "Невидиме" коло, яке збільшує bounding box (для перевірки - зробимо його червоним)
  const invisibleRadius = radius + 20;

  const markRadius = radius - strokeWidth / 2 - 10;
  const renderMinuteTicks = () => {
    const ticks = [];
    const totalTicks = 144;
    for (let i = 0; i < totalTicks; i++) {
      if (i % 6 === 0) continue;
      const minutes = i * 10;
      const angle = (minutes / TOTAL_MINUTES) * 2 * Math.PI - Math.PI / 2;
      const innerTick = markRadius - 3;
      const outerTick = markRadius + 3;
      const x1 = center + innerTick * Math.cos(angle);
      const y1 = center + innerTick * Math.sin(angle);
      const x2 = center + outerTick * Math.cos(angle);
      const y2 = center + outerTick * Math.sin(angle);
      ticks.push(
        <Line key={`min-tick-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ccc" strokeWidth={1} />
      );
    }
    return ticks;
  };

  const renderHourlyTicks = () => {
    const ticks = [];
    for (let hour = 0; hour < 24; hour++) {
      if ([0, 6, 12, 18].includes(hour)) continue;
      const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
      const tickLength = 8;
      const innerTick = markRadius - tickLength / 2;
      const outerTick = markRadius + tickLength / 2;
      const x1 = center + innerTick * Math.cos(angle);
      const y1 = center + innerTick * Math.sin(angle);
      const x2 = center + outerTick * Math.cos(angle);
      const y2 = center + outerTick * Math.sin(angle);
      ticks.push(
        <Line key={`hour-tick-${hour}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth={2} />
      );
    }
    return ticks;
  };

  const renderMajorMarks = () => {
    const majorHours = [0, 6, 12, 18];
    return majorHours.map((hour) => {
      const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
      const x = center + markRadius * Math.cos(angle);
      const y = center + markRadius * Math.sin(angle);
      return (
        <SvgText
          key={`major-${hour}`}
          x={x}
          y={y}
          fill="#444"
          fontSize={14}
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {hour}
        </SvgText>
      );
    });
  };

  // Координати центру ручки для startProgress
  const startHandleX = center + radius * Math.cos(2 * Math.PI * startProgress - Math.PI / 2);
  const startHandleY = center + radius * Math.sin(2 * Math.PI * startProgress - Math.PI / 2);
  // Координати центру ручки для endProgress
  const endHandleX = center + radius * Math.cos(2 * Math.PI * endProgress - Math.PI / 2);
  const endHandleY = center + radius * Math.sin(2 * Math.PI * endProgress - Math.PI / 2);

  // Розмір ручок: базовий = 10, активний = 20
  const startHandleRadius = activeHandle === 'start' ? 20 : 10;
  const endHandleRadius = activeHandle === 'end' ? 20 : 10;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Svg
        width={size}
        height={size}
        style={{ overflow: 'visible', backgroundColor: 'transparent' }}
      >
        {/* Невидиме коло (для збільшення bounding box) - тепер червоне */}
        <Circle
          cx={center}
          cy={center}
          r={invisibleRadius}
          fill="transparent"
          stroke="red"
        />

        {renderMinuteTicks()}
        {renderHourlyTicks()}
        {renderMajorMarks()}

        {/* Фонова окружність */}
        <Circle
          stroke="#e6e6e6"
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
        />

        {/* Активна частина шкали */}
        <Circle
          stroke="#3498db"
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />

        {/* Ручка для кінця */}
        <Circle
          cx={center + radius * Math.cos(2 * Math.PI * endProgress - Math.PI / 2)}
          cy={center + radius * Math.sin(2 * Math.PI * endProgress - Math.PI / 2)}
          r={endHandleRadius}
          fill="#3498db"
        />

        {/* Ручка для початку */}
        <Circle
          cx={center + radius * Math.cos(2 * Math.PI * startProgress - Math.PI / 2)}
          cy={center + radius * Math.sin(2 * Math.PI * startProgress - Math.PI / 2)}
          r={startHandleRadius}
          fill="#3498db"
        />

        {/* Текстові поля з часом */}
        <SvgText
          x={center}
          y={center - 10}
          fill="#444"
          fontSize={18}
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {formatTime(startProgress)}
        </SvgText>
        <SvgText
          x={center}
          y={center + 20}
          fill="#444"
          fontSize={18}
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {formatTime(endProgress)}
        </SvgText>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
    overflow: 'visible',
  },
});

export default SleepSchedule;