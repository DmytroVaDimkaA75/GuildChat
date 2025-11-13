import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const CustomCheckBox = ({ title, checked, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <View
        style={{
          height: 24,
          width: 24,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: checked ? '#007AFF' : '#ccc',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'transparent',
        }}
      >
        {checked && (
          <Icon
            name="check"
            size={18} // Зменшений розмір галочки
            color="#007AFF"
            style={{ position: 'absolute', top: 2, left: 2 }} // Виправлене позиціонування
          />
        )}
      </View>
      <Text style={{ marginLeft: 10 }}>{title}</Text>
    </TouchableOpacity>
  );
};

export default CustomCheckBox;

