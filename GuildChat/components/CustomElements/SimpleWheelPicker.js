
import React, { useRef, useEffect } from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 5;

const SimpleWheelPicker = ({ data, selectedIndex, onValueChange }) => {
  const flatListRef = useRef(null);

  // Скролити до вибраного індексу при зміні selectedIndex
  useEffect(() => {
    if (flatListRef.current && selectedIndex != null) {
      flatListRef.current.scrollToOffset({
        offset: Math.max(0, ITEM_HEIGHT * selectedIndex),
        animated: false,
      });
    }
  }, [selectedIndex]);

  const onScrollEnd = (e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    let index = Math.round(offsetY / ITEM_HEIGHT);
    if (index < 0) index = 0;
    if (index > data.length - 1) index = data.length - 1;
    if (index !== selectedIndex) {
      onValueChange(data[index], index);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={(item, index) => index.toString()}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={selectedIndex}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            <Text style={[
              styles.itemText,
              index === selectedIndex && styles.selectedText
            ]}>
              {item}
            </Text>
          </View>
        )}
        contentContainerStyle={{
          paddingVertical: (ITEM_HEIGHT * (VISIBLE_ITEMS - 1)) / 2,
        }}
      />
      <View style={styles.highlight} pointerEvents="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 20,
    color: '#333',
  },
  selectedText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    height: ITEM_HEIGHT,
    width: '100%',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
});

export default SimpleWheelPicker;