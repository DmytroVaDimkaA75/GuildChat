import { useEffect, useState } from "react";
import { FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
// ШАГ 1: Правильный импорт
import database from '@react-native-firebase/database';

const GuildSelector = () => {
  const [buildingNames, setBuildingNames] = useState([]);
  const [selectedBonus, setSelectedBonus] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    // ШАГ 2: Правильная логика
    const buildingRef = database().ref('/greatBuildings');

    const onDataChange = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const buildingNamesArray = Object.keys(data).map(key => ({
          name: data[key].buildingName,
          imageUrl: data[key].imageUrl,
          bonus: data[key].bonus
        }));
        setBuildingNames(buildingNamesArray);
      }
    };

    // Подписываемся на изменения
    buildingRef.on('value', onDataChange, (error) => {
      console.error("Error fetching data: ", error);
    });

    // ШАГ 3: Правильная отписка
    return () => buildingRef.off('value', onDataChange);

  }, []); // Пустой массив зависимостей, чтобы useEffect выполнился один раз

  return (
    <View style={styles.container}>
      <View style={styles.bonusContainer}>
        {selectedBonus && <Text style={styles.selectedBonusText}>Бонус: {selectedBonus}</Text>}
      </View>
      
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Виберіть гільдію:</Text>
            <FlatList
              data={buildingNames}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.itemContainer}
                  onPress={() => {
                    setSelectedBonus(item.bonus);
                    setModalVisible(false);
                  }}
                >
                  <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
                  <Text style={styles.itemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Закрити</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {!selectedBonus && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.buttonText}>Обрати ВС</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginBottom: 20,
      backgroundColor: "#0f1115"
    },
    bonusContainer: {
      position: 'absolute',
      top: 50,
      alignItems: 'center',
    },
    selectedBonusText: {
      fontSize: 20,
      color: '#f4f7fb',
      marginBottom: 10,
    },
    footer: {
      width: '100%',
      position: 'absolute',
      bottom: 50,
      padding: 20,
    },
    button: {
      backgroundColor: '#4ea1ff',
      padding: 15,
      borderRadius: 10,
      width: '100%',
      alignItems: 'center',
    },
    buttonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContainer: {
      backgroundColor: '#152330',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 10,
    },
    itemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      backgroundColor: '#4ea1ff',
      marginBottom: 10,
      borderRadius: 10,
    },
    itemImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 10,
    },
    itemText: {
      color: 'white',
      fontSize: 18,
    },
    closeButton: {
      backgroundColor: '#4ea1ff',
      padding: 15,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 10,
    },
    closeButtonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
    },
  });

export default GuildSelector;
