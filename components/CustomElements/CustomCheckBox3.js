import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const CustomCheckBox = ({ title, checked, onPress, checkmarkSize = 26, checkmarkPositionX = 1, checkmarkPositionY = -6 }) => {
const checkboxSize = 24; // Розмір квадрату чекбокса

return (
<TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
<View style={{ height: checkboxSize, width: checkboxSize, borderRadius: 4, borderWidth: checked ? 3 : 1, borderColor: '#007AFF', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
{checked && (
<Svg width={checkmarkSize} height={checkmarkSize} viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: checkmarkPositionY, left: checkmarkPositionX }}>
{/* Зелена обводка */}
<Path d={`M${(checkmarkSize * 20) / 24} ${(checkmarkSize * 6) / 24}L${(checkmarkSize * 9) / 24} ${(checkmarkSize * 17) / 24}L${(checkmarkSize * 4) / 24} ${(checkmarkSize * 12) / 24}`} stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
{/* Основна блакитна галочка */}
<Path d={`M${(checkmarkSize * 20) / 24} ${(checkmarkSize * 6) / 24}L${(checkmarkSize * 9) / 24} ${(checkmarkSize * 17) / 24}L${(checkmarkSize * 4) / 24} ${(checkmarkSize * 12) / 24}`} stroke="#007AFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
</Svg>
)}
</View>
<Text style={{ marginLeft: 10 }}>{title}</Text>
</TouchableOpacity>
);
};

export default CustomCheckBox;