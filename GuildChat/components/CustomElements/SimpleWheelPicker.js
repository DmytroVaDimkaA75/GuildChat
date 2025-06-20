import React, { useRef, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, TouchableWithoutFeedback } from 'react-native';

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 5;

const SimpleWheelPicker = ({ data, selectedIndex = 0, onValueChange, renderItem }) => {
  const scrollViewRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);

  // Scroll to selected index when component mounts or selectedIndex changes externally
  useEffect(() => {
    if (scrollViewRef.current && selectedIndex != null) {
      scrollToIndex(selectedIndex, false);
      setCurrentIndex(selectedIndex);
    }
  }, [selectedIndex]);

  // Helper function to scroll to a specific index
  const scrollToIndex = (index, animated = true) => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: Math.max(0, ITEM_HEIGHT * index),
        animated,
      });
    }
  };

  // Handle scroll end event
  const handleScrollEnd = (e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    let index = Math.round(offsetY / ITEM_HEIGHT);
    
    // Ensure index is within valid range
    index = Math.max(0, Math.min(index, data.length - 1));
    
    // Update if the index changed
    if (index !== currentIndex) {
      setCurrentIndex(index);
      onValueChange && onValueChange(data[index], index);
      
      // Ensure proper snap alignment (important for touch interactions)
      scrollToIndex(index);
    }
  };

  // Handle direct item selection
  const handleItemPress = (index) => {
    setCurrentIndex(index);
    onValueChange && onValueChange(data[index], index);
    scrollToIndex(index);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingVertical: (ITEM_HEIGHT * (VISIBLE_ITEMS - 1)) / 2,
        }}
      >
        {data.map((item, index) => (
          <TouchableWithoutFeedback
            key={index}
            onPress={() => handleItemPress(index)}
          >
            <View style={styles.item}>
              {renderItem ? (
                renderItem(item, index, index === currentIndex)
              ) : (
                <Text
                  style={[
                    styles.itemText,
                    index === currentIndex && styles.selectedText,
                  ]}
                >
                  {item}
                </Text>
              )}
            </View>
          </TouchableWithoutFeedback>
        ))}
      </ScrollView>
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
    width: '100%', // Ensure items span the full width for better touch targets
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
    //borderTopWidth: 1,
    //borderBottomWidth: 1,
    borderColor: '#007aff',
  },
});

export default SimpleWheelPicker;