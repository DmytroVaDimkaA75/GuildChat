import storage from '@react-native-firebase/storage';
import { useState } from 'react';
import { Button, Image, StyleSheet, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';

const ImageUploader = ({ onUploadComplete }) => {
  const [imageUri, setImageUri] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const selectImage = () => {
    const options = {
      mediaType: 'photo',
      quality: 1,
    };

    launchImageLibrary(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.errorCode) {
        console.log('ImagePicker Error: ', response.errorMessage);
      } else if (response.assets && response.assets.length > 0) {
        setImageUri(response.assets[0].uri);
        setImageUrl(null);
      }
    });
  };

  const uploadImage = async () => {
    if (!imageUri) return;

    setUploading(true);
    const fileName = imageUri.substring(imageUri.lastIndexOf('/') + 1);
    const reference = storage().ref(`/chatImages/${fileName}`);
    
    try {
      await reference.putFile(imageUri);
      
      const url = await reference.getDownloadURL();
      
      setImageUrl(url);
      setUploading(false);

      if (onUploadComplete) {
        onUploadComplete(url);
      }

    } catch (error) {
      console.error('Image upload error: ', error);
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Выбрать изображение" onPress={selectImage} />
      
      {imageUri && (
        <Image 
          source={{ uri: imageUri }} 
          style={styles.imagePreview} 
        />
      )}
      
      <Button 
        title="Загрузить изображение" 
        onPress={uploadImage} 
        disabled={uploading || !imageUri} 
      />

      {uploading && <Text style={styles.statusText}>Загрузка...</Text>}
      {imageUrl && <Text style={styles.statusText}>Изображение успешно загружено!</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 10,
  },
  imagePreview: {
    width: 150,
    height: 150,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  statusText: {
    marginTop: 10,
    color: 'green',
  }
});

export default ImageUploader;