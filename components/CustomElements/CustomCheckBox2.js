import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const CustomCheckBox = ({ title, checked, onPress }) => {
return (
<TouchableOpacity
onPress={onPress}
style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
>
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
<Svg
width="18" // Ширина SVG-іконки
height="18" // Висота SVG-іконки
viewBox="0 0 24 24"
fill="none"
style={{
position: 'absolute',
top: 3,
left: 3,
}}
>
<Path
d="M20 6L9 17L4 12" // Векторний шлях для галочки
stroke="#007AFF" // Колір лінії галочки
strokeWidth="2" // Товщина лінії галочки
strokeLinecap="round" // Зробити кінці лінії круглими
strokeLinejoin="round" // Зробити кути з'єднання круглими
/>
</Svg>
)}
</View>
<Text style={{ marginLeft: 10 }}>{title}</Text>
</TouchableOpacity>
);
};

export default CustomCheckBox;