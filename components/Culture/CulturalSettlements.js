// components/CulturalSettlements.js
import { useNavigation } from '@react-navigation/native';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  border: '#36516a',
  textPrimary: '#f4f7fb',
  accent: '#4ea1ff',
};

const SETTLEMENTS = [
  {
    label: 'Вікінги',
    value: 'vikings',
    image: require('./Vikings.png'),
  },
  {
    label: 'Феодальна Японія',
    value: 'japanese',
    image: require('./Japan.png'),
  },
  {
    label: 'Стародавній Єгипет',
    value: 'egyptians',
    image: require('./Egypt.png'),
  },
  {
    label: 'Ацтеки',
    value: 'aztecs',
    image: require('./Aztecs.png'),
  },
  {
    label: 'Імперія Моголів',
    value: 'mughals',
    image: require('./Mughal.png'),
  },
  {
    label: 'Полінезія',
    value: 'polynesia',
    image: require('./Polynesia.png'),
  },
  {
    label: 'Піратське поселення',
    value: 'pirates',
    image: require('./Pirates.png'),
  },
];

const CulturalSettlements = () => {
  const navigation = useNavigation();

  const handleSelect = (value) => {
    navigation.navigate('CulturalOptions', {
      settlementName: value,
    });
  };

  return (
    <View style={styles.container}>
      {SETTLEMENTS.map((item) => (
        <TouchableOpacity
          key={item.value}
          style={styles.settlementsItem}
          onPress={() => handleSelect(item.value)}
          activeOpacity={0.8}
        >
          <Image source={item.image} style={styles.buildingImage} />
          <Text style={styles.optionText}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  settlementsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 5,
    marginBottom: 15,
    padding: 10,
  },
  buildingImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    marginRight: 8,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
});

export default CulturalSettlements;
