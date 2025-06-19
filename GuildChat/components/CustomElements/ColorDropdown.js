import React from 'react';
import { View, Text } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';

const allowedColors = [
  { label: 'Зелений', value: '#32CD32', color: '#32CD32' },
  { label: 'Жовтий', value: '#FFFF00', color: '#FFFF00' },
  { label: 'Сірий', value: '#DCDCDC', color: '#DCDCDC' },
];

export default function ColorDropdown({ value, onChange, style }) {
  return (
    <Dropdown
      style={[{ borderWidth: 1, borderRadius: 8, padding: 10 }, style]}
      data={allowedColors}
      labelField="label"
      valueField="value"
      value={value}
      placeholder="Оберіть колір"
      onChange={item => onChange(item.value)}
      renderItem={item => (
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10 }}>
          <View style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: item.color,
            marginRight: 10,
            borderWidth: 1,
            borderColor: '#ccc'
          }} />
          <Text>{item.label}</Text>
        </View>
      )}
    />
  );
}
