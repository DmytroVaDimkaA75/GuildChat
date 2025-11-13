import { useState } from 'react';
import {
  Image,
  PermissionsAndroid, // Импортируем для запроса прав на Android
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// ИЗМЕНЕНО: Импортируем функцию из новой библиотеки
import { launchImageLibrary } from 'react-native-image-picker';

const CustomImagePicker = () => {
  const [selectedImages, setSelectedImages] = useState([]);
  const [description, setDescription] = useState('');

  const pickImages = async () => {
    // ИЗМЕНЕНО: Логика запроса прав доступа
    // Для Android права нужно запрашивать явно
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        {
          title: 'Доступ до галереї',
          message: 'Додатку потрібен доступ до ваших фото, щоб ви могли їх вибрати.',
          buttonNeutral: 'Запитати пізніше',
          buttonNegative: 'Скасувати',
          buttonPositive: 'OK',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        alert('Доступ до медіатеки не надано.');
        return;
      }
    }
    // Для iOS права запрашиваются автоматически при вызове, если они прописаны в Info.plist

    // ИЗМЕНЕНО: Вызов функции выбора изображений
    const result = await launchImageLibrary({
      mediaType: 'photo', // Указываем, что нужны только изображения
      quality: 1,
      selectionLimit: 0, // 0 означает, что можно выбирать неограниченное количество фото
    });

    // ИЗМЕНЕНО: Обработка результата
    if (!result.didCancel && result.assets) {
      const newImages = result.assets.map(asset => asset.uri);
      setSelectedImages(prevImages => [...prevImages, ...newImages]); // Добавляем новые изображения к уже выбранным
    }
  };

  return (
    <View style={{ padding: 20 }}>
      {/* Поле для вводу тексту */}
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Додати опис..."
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          width: '100%',
          borderRadius: 5,
          marginBottom: 20,
        }}
      />

      {/* Кнопка для відкриття галереї */}
      <TouchableOpacity
        onPress={pickImages}
        style={{
          backgroundColor: '#007bff',
          padding: 10,
          borderRadius: 5,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#fff' }}>Вибрати зображення</Text>
      </TouchableOpacity>

      {/* Відображення вибраних зображень */}
      <ScrollView horizontal style={{ marginTop: 20 }}>
        {selectedImages.map((imageUri, index) => (
          <Image
            key={index}
            source={{ uri: imageUri }}
            style={{ width: 100, height: 100, marginRight: 10 }}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default CustomImagePicker;