// Синхронізована «бігуча строка» для списків, де підписи різної довжини.
//
// Усі рядки в одній групі рухаються від ЄДИНОГО таймера: одночасно рушають,
// одночасно доходять до кінця, одночасно роблять паузу й повертаються. Швидкість
// однакова для всіх (px/сек), тож коротший підпис просто раніше дотягується до
// краю й чекає, поки найдовший добіжить. Підписи, що вміщаються повністю, не
// анімуються зовсім.
//
// Використання:
//   <SyncedMarqueeGroup>
//     {items.map((it) => (
//       <Row key={it.id}>
//         <SyncedMarqueeText id={it.id} style={{ flex: 1 }}>
//           <Text style={a}>{it.title}</Text>
//           <Text style={b}>{'  ·  ' + it.subtitle}</Text>
//         </SyncedMarqueeText>
//       </Row>
//     ))}
//   </SyncedMarqueeGroup>

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, View } from 'react-native';

const SPEED_MS_PER_PX = 22; // менша цифра — швидший біг
const MIN_DURATION = 2600;
const MAX_DURATION = 9000;
const EDGE_HOLD = 1400; // пауза на краях, щоб встигнути прочитати
const TAIL_GAP = 24; // наскільки px «дотягувати» текст за правий край

const Ctx = createContext(null);

export function SyncedMarqueeGroup({ children, enabled = true }) {
  const driver = useRef(new Animated.Value(0)).current;
  const distancesRef = useRef(new Map());
  const [maxDistance, setMaxDistance] = useState(0);

  const register = useCallback((id, distance) => {
    const map = distancesRef.current;
    const rounded = Math.round(distance);
    if (rounded > 0) {
      if (map.get(id) === rounded) return;
      map.set(id, rounded);
    } else {
      if (!map.has(id)) return;
      map.delete(id);
    }
    let next = 0;
    for (const value of map.values()) next = Math.max(next, value);
    setMaxDistance((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    driver.stopAnimation();
    driver.setValue(0);
    if (!enabled || maxDistance <= 0) return undefined;
    const duration = Math.min(
      MAX_DURATION,
      Math.max(MIN_DURATION, maxDistance * SPEED_MS_PER_PX)
    );
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(driver, {
          toValue: 1,
          duration,
          delay: EDGE_HOLD,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(driver, {
          toValue: 0,
          duration,
          delay: EDGE_HOLD,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [driver, maxDistance, enabled]);

  const value = useMemo(
    () => ({ driver, maxDistance, register }),
    [driver, maxDistance, register]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SyncedMarqueeText({ id, height = 20, style, children }) {
  const ctx = useContext(Ctx);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const distance =
    containerWidth > 0 && contentWidth > 0
      ? Math.max(0, contentWidth - containerWidth + TAIL_GAP)
      : 0;

  useEffect(() => {
    ctx?.register(id, distance);
  }, [ctx, id, distance]);

  useEffect(
    () => () => ctx?.register(id, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );

  const maxDistance = ctx?.maxDistance || 0;
  const driver = ctx?.driver;

  const translateX = useMemo(() => {
    if (!driver || distance <= 0 || maxDistance <= 0) return 0;
    const ratio = Math.min(1, Math.max(0.001, distance / maxDistance));
    return driver.interpolate({
      inputRange: ratio >= 1 ? [0, 1] : [0, ratio, 1],
      outputRange: ratio >= 1 ? [0, -distance] : [0, -distance, -distance],
      extrapolate: 'clamp',
    });
  }, [driver, distance, maxDistance]);

  return (
    <View
      style={[{ height, overflow: 'hidden' }, style]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height,
          flexDirection: 'row',
          alignItems: 'center',
          transform: [{ translateX }],
        }}
        onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
      >
        {children}
      </Animated.View>
    </View>
  );
}
