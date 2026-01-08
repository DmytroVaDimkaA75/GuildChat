import AsyncStorage from "@react-native-async-storage/async-storage";
import database from '@react-native-firebase/database'; // ИЗМЕНЕНО
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { v4 as uuidv4 } from 'uuid';
import AlarmClockIcon from '../ico/alarm-clock.svg'; // Іконка будильника
import BedIcon from '../ico/bed.svg'; // Іконка ліжка

const TOTAL_MINUTES = 24 * 60;
const THEME = {
  background: '#121212',
  surface: '#1c1c1c',
  ring: '#242424',
  dial: '#151515',
  tickMajor: '#4b4b4b',
  tickMinor: '#2f2f2f',
  textPrimary: '#f5f5f5',
  textSecondary: '#b0b0b0',
  accent: '#3498db',
};

/** Перетворює кут у формат HH:MM. 
 * -90° (-Math.PI/2) => 00:00, 360° => 24:00
 */
const formatTimeFromAngle = (angle) => {
  let adjusted = angle + Math.PI / 2;
  if (adjusted < 0) adjusted += 2 * Math.PI;
  const fraction = adjusted / (2 * Math.PI);
  const totalMins = Math.round(fraction * TOTAL_MINUTES);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
};

/** Перетворює кут у UTC ISO string (тільки час, дата довільна) */
const angleToUtcTime = (angle) => {
  let adjusted = angle + Math.PI / 2;
  if (adjusted < 0) adjusted += 2 * Math.PI;
  const fraction = adjusted / (2 * Math.PI);
  const totalMins = Math.round(fraction * TOTAL_MINUTES);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  // Створюємо дату з цим часом в UTC (дата довільна, наприклад 1970-01-01)
  const date = new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
  return date.toISOString(); // повертає у форматі '1970-01-01THH:MM:00.000Z'
};

const daysOfWeek = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const monthNames = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

const SleepSchedule = () => {
  const { width } = Dimensions.get('window');
  const navigation = useNavigation();
  const route = useRoute();

  // Основні розміри
  const redDiameter = width;
  const innerDiameter = width - 40;
  const smallDiameter = width - 100;

  // Центр
  const cx = redDiameter / 2;
  const cy = redDiameter / 2;

  // Зовнішній і внутрішній радіус кільця (фон шкали)
  const R1 = innerDiameter / 2;
  const R2 = smallDiameter / 2;

  // Шлях для кільця (донату) з fillRule="evenodd"
  const ringPath = `
    M ${cx} ${cy - R1}
    A ${R1} ${R1} 0 1 1 ${cx} ${cy + R1}
    A ${R1} ${R1} 0 1 1 ${cx} ${cy - R1}
    M ${cx} ${cy - R2}
    A ${R2} ${R2} 0 1 0 ${cx} ${cy + R2}
    A ${R2} ${R2} 0 1 0 ${cx} ${cy - R2}
    Z
  `;

  // Кути ручок
  const [greenStartAngle, setGreenStartAngle] = useState(-Math.PI / 2);
  const [greenEndAngle, setGreenEndAngle] = useState(-Math.PI / 2 + (120 * Math.PI) / 180);

  // Координати ручок
  const fixedDistance = R1 - 15;
  const greenX1 = cx + fixedDistance * Math.cos(greenStartAngle);
  const greenY1 = cy + fixedDistance * Math.sin(greenStartAngle);
  const greenX2 = cx + fixedDistance * Math.cos(greenEndAngle);
  const greenY2 = cy + fixedDistance * Math.sin(greenEndAngle);

  // Синя дуга
  let angleDiff = greenEndAngle - greenStartAngle;
  if (angleDiff < 0) angleDiff += 2 * Math.PI;
  const largeArcFlag = angleDiff > Math.PI ? 1 : 0;

  const outerStartX = cx + R1 * Math.cos(greenStartAngle);
  const outerStartY = cy + R1 * Math.sin(greenStartAngle);
  const outerEndX   = cx + R1 * Math.cos(greenEndAngle);
  const outerEndY   = cy + R1 * Math.sin(greenEndAngle);
  const innerEndX   = cx + R2 * Math.cos(greenEndAngle);
  const innerEndY   = cy + R2 * Math.sin(greenEndAngle);
  const innerStartX = cx + R2 * Math.cos(greenStartAngle);
  const innerStartY = cy + R2 * Math.sin(greenStartAngle);

  const d = `
    M ${outerStartX} ${outerStartY}
    A ${R1} ${R1} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}
    L ${innerEndX} ${innerEndY}
    A ${R2} ${R2} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}
    Z
  `;

  // Активність ручок
  const [isGreenStartActive, setIsGreenStartActive] = useState(false);
  const [isGreenEndActive, setIsGreenEndActive] = useState(false);

  const greenStartPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { setIsGreenStartActive(true); },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newAngle = Math.atan2(locationY - cy, locationX - cx);
        setGreenStartAngle(newAngle);
      },
      onPanResponderRelease: () => { setIsGreenStartActive(false); },
      onPanResponderTerminate: () => { setIsGreenStartActive(false); },
    })
  ).current;

  const greenEndPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { setIsGreenEndActive(true); },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newAngle = Math.atan2(locationY - cy, locationX - cx);
        setGreenEndAngle(newAngle);
      },
      onPanResponderRelease: () => { setIsGreenEndActive(false); },
      onPanResponderTerminate: () => { setIsGreenEndActive(false); },
    })
  ).current;

  // Розмір ручок
  const startDiameter = isGreenStartActive ? 40 : 30;
  const endDiameter = isGreenEndActive ? 40 : 30;
  const startRadiusControl = startDiameter / 2;
  const endRadiusControl = endDiameter / 2;

  // Масштаб іконок
  const ICON_SCALE = 0.7;
  const startIconSize = startDiameter * ICON_SCALE;
  const endIconSize = endDiameter * ICON_SCALE;
  const startIconOffset = startIconSize / 2;
  const endIconOffset = endIconSize / 2;

  // Зміщення іконок
  const ICON_POSITION_SHIFT_X = 0;
  const ICON_POSITION_SHIFT_Y = 0;

  // Відмальовування розмітки (за бажанням можна відключити, якщо не треба)
  const renderMinuteTicks = () => {
    const ticks = [];
    const markRadius = (smallDiameter / 2) - 10;
    const totalTicks = 144;
    for (let i = 0; i < totalTicks; i++) {
      if (i % 6 === 0) continue;
      const angle = (i * 10) * (2 * Math.PI / 1440) - Math.PI / 2;
      const innerTick = markRadius - 3;
      const outerTick = markRadius + 3;
      const tx1 = cx + innerTick * Math.cos(angle);
      const ty1 = cy + innerTick * Math.sin(angle);
      const tx2 = cx + outerTick * Math.cos(angle);
      const ty2 = cy + outerTick * Math.sin(angle);
      ticks.push(
        <Line
          key={`min-tick-${i}`}
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          stroke={THEME.tickMinor}
          strokeWidth={1}
        />
      );
    }
    return ticks;
  };

  const renderHourlyTicks = () => {
    const ticks = [];
    const markRadius = (smallDiameter / 2) - 10;
    for (let hour = 0; hour < 24; hour++) {
      if ([0, 6, 12, 18].includes(hour)) continue;
      const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
      const tickLength = 8;
      const innerTick = markRadius - tickLength / 2;
      const outerTick = markRadius + tickLength / 2;
      const tx1 = cx + innerTick * Math.cos(angle);
      const ty1 = cy + innerTick * Math.sin(angle);
      const tx2 = cx + outerTick * Math.cos(angle);
      const ty2 = cy + outerTick * Math.sin(angle);
      ticks.push(
        <Line
          key={`hour-tick-${hour}`}
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          stroke={THEME.tickMajor}
          strokeWidth={2}
        />
      );
    }
    return ticks;
  };

  const renderMajorMarks = () => {
    const marks = [];
    const markRadius = (smallDiameter / 2) - 10;
    const majorHours = [0, 6, 12, 18];
    majorHours.forEach((hour) => {
      const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
      const tx = cx + markRadius * Math.cos(angle);
      const ty = cy + markRadius * Math.sin(angle);
      marks.push(
        <SvgText
          key={`major-${hour}`}
          x={tx}
          y={ty}
          fill={THEME.textSecondary}
          fontSize={14}
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {hour}
        </SvgText>
      );
    });
    return marks;
  };

  // Стан для вибраних днів тижня
  const [selectedDays, setSelectedDays] = useState([1,2,3,4,5]); // за замовчуванням робочі дні
  const [viewMode, setViewMode] = useState('week');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const toggleDay = (idx) => {
    setSelectedDays((prev) =>
      prev.includes(idx)
        ? prev.filter((d) => d !== idx)
        : [...prev, idx]
    );
  };

  const getMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = [];

    for (let i = 0; i < firstDayIndex; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  };

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // ИЗМЕНЕНО: Збереження часу в Firebase
  const handleSave = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) return;
      const uuid = uuidv4();
      await database()
        .ref(`users/${userId}/setting/shedule/${uuid}`)
        .set({
          timeStart: angleToUtcTime(greenStartAngle),
          timeEnd: angleToUtcTime(greenEndAngle),
          // days: selectedDays, // поки не зберігаємо
        });
      // Можна додати повідомлення про успіх
    } catch (e) {
      // Можна додати повідомлення про помилку
      console.error(e);
    }
  };

  // Передаємо handleSave у route.params для доступу з хедера
  React.useEffect(() => {
    navigation.setParams?.({ handleSave });
  }, [greenStartAngle, greenEndAngle]);

  return (
    <View style={styles.container}>
      <Svg width={redDiameter} height={redDiameter}>
        {/* Зовнішнє коло (фон) */}
        <Circle cx={cx} cy={cy} r={redDiameter / 2} fill={THEME.background} />

        {/* Кільцева дуга (фон шкали) */}
        <Path d={ringPath} fill={THEME.ring} fillRule="evenodd" />

        {/* Синя дуга (шкали) */}
        <Path d={d} fill={THEME.accent} />

        {/* Маленьке коло (фон розмітки) */}
        <Circle cx={cx} cy={cy} r={smallDiameter / 2} fill={THEME.dial} />
        {renderMinuteTicks()}
        {renderHourlyTicks()}
        {renderMajorMarks()}

        {/* 
          1) Іконка будильника + час (greenStartAngle) -- початок активності
        */}
        <G transform={`translate(${cx-50}, ${cy - 30})`}>
          <G>
            <AlarmClockIcon width={24} height={24} fill={THEME.textSecondary} />
          </G>
          <SvgText
            x={30}
            y={23}
            fill={THEME.textPrimary}
            fontSize="32"
            fontWeight="bold"
            textAnchor="start"
          >
            {formatTimeFromAngle(greenStartAngle)}
          </SvgText>
        </G>

        {/* 
          2) Іконка ліжка + час (greenEndAngle) -- кінець активності
        */}
        <G transform={`translate(${cx - 50}, ${cy+5})`}>
          <G>
            <BedIcon width={24} height={24} fill={THEME.textSecondary} />
          </G>
          <SvgText
            x={30}
            y={23}
            fill={THEME.textPrimary}
            fontSize="32"
            fontWeight="bold"
            textAnchor="start"
          >
            {formatTimeFromAngle(greenEndAngle)}
          </SvgText>
        </G>

        {/* Група "start" (ручка з AlarmClockIcon) */}
        <G transform={`translate(${greenX1}, ${greenY1})`} {...greenStartPanResponder.panHandlers}>
          <Circle cx={0} cy={0} r={startRadiusControl} fill={THEME.accent} />
          <G transform={`translate(${ICON_POSITION_SHIFT_X - startIconOffset}, ${ICON_POSITION_SHIFT_Y - startIconOffset})`}>
            <AlarmClockIcon
              width={startIconSize}
              height={startIconSize}
              fill="#fff"
            />
          </G>
        </G>

        {/* Група "end" (ручка з BedIcon) */}
        <G transform={`translate(${greenX2}, ${greenY2})`} {...greenEndPanResponder.panHandlers}>
          <Circle cx={0} cy={0} r={endRadiusControl} fill={THEME.accent} />
          <G transform={`translate(${ICON_POSITION_SHIFT_X - endIconOffset}, ${ICON_POSITION_SHIFT_Y - endIconOffset})`}>
            <BedIcon
              width={endIconSize}
              height={endIconSize}
              fill="#fff"
            />
          </G>
        </G>
      </Svg>
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'week' && styles.toggleButtonActive]}
          onPress={() => setViewMode('week')}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleButtonText, viewMode === 'week' && styles.toggleButtonTextActive]}>
            Тиждень
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'month' && styles.toggleButtonActive]}
          onPress={() => setViewMode('month')}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleButtonText, viewMode === 'month' && styles.toggleButtonTextActive]}>
            Місяць
          </Text>
        </TouchableOpacity>
      </View>
      {viewMode === 'week' ? (
        <View style={styles.daysRow}>
          {daysOfWeek.map((day, idx) => (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayButton,
                selectedDays.includes(idx) && styles.dayButtonActive
              ]}
              onPress={() => toggleDay(idx)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayButtonText,
                selectedDays.includes(idx) && styles.dayButtonTextActive
              ]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.monthWrapper}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.monthArrow} activeOpacity={0.7}>
              <Text style={styles.monthArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={handleNextMonth} style={styles.monthArrow} activeOpacity={0.7}>
              <Text style={styles.monthArrowText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.monthWeekRow}>
            {daysOfWeek.map((day) => (
              <Text key={day} style={styles.monthWeekday}>
                {day}
              </Text>
            ))}
          </View>
          {getMonthDays().map((week, index) => (
            <View key={`week-${index}`} style={styles.monthWeekRow}>
              {week.map((day, dayIndex) => (
                <View key={`day-${index}-${dayIndex}`} style={styles.monthDayCell}>
                  <Text style={[styles.monthDayText, !day && styles.monthDayTextMuted]}>
                    {day ?? ''}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingBottom: 16,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(52,152,219,0.15)',
    borderColor: THEME.accent,
  },
  toggleButtonText: {
    color: THEME.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  toggleButtonTextActive: {
    color: THEME.textPrimary,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 3,
  },
  dayButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 1.5,
    minWidth: 32,
    alignItems: 'center',
  },
  dayButtonActive: {
    backgroundColor: 'rgba(52,152,219,0.15)',
    borderColor: THEME.accent,
  },
  dayButtonText: {
    color: THEME.textSecondary,
    fontWeight: '700',
    fontSize: 15,
  },
  dayButtonTextActive: {
    color: THEME.textPrimary,
  },
  monthWrapper: {
    width: '92%',
    backgroundColor: THEME.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthTitle: {
    color: THEME.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  monthArrow: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  monthArrowText: {
    color: THEME.textSecondary,
    fontSize: 24,
  },
  monthWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthWeekday: {
    flex: 1,
    textAlign: 'center',
    color: THEME.textSecondary,
    fontWeight: '600',
    fontSize: 12,
    paddingVertical: 4,
  },
  monthDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  monthDayText: {
    color: THEME.textPrimary,
    fontSize: 14,
  },
  monthDayTextMuted: {
    color: 'transparent',
  },
});

export default SleepSchedule;
