import { useNavigation, useRoute } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const COLORS = {
  background: '#121212',
  surface: '#1E1E1E',
  border: '#2F2F2F',
  textPrimary: '#FFFFFF',
  accent: '#2196f3',
};

const CulturalOptions = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;

  const handleOpenTechnologyCosts = () => {
    navigation.navigate('TechnologyCosts', { settlementName });
  };

  const handleOpenObstacles = () => {
    navigation.navigate('ObstaclesMap', {
      settlementName,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Обране поселення: {settlementName || '—'}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleOpenTechnologyCosts}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Вартість технологій</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={handleOpenObstacles}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Перешкоди</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    width: '90%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CulturalOptions;
