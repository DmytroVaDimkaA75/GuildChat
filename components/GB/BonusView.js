import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const BonusView = ({ bonus, build }) => {
  // Состояние для ОДНОГО модального окна, а не для массива
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [parsedBonus, setParsedBonus] = useState('');

  useEffect(() => {
    const replaceBookmarks = async () => {
      if (!bonus || !build) return;

      try {
        // Проверяем, что все нужные данные есть
        if (!build.levelBase || typeof build.level === 'undefined') {
          console.error('Invalid build data:', build);
          return;
        }

        const jsonFileURLNow = `${build.levelBase}${build.level}`;
        const response = await fetch(jsonFileURLNow);
        if (!response.ok) {
          console.error('Failed to fetch JSON data');
          return;
        }
        const data = await response.json();

        const bookmarkPattern = /{([^{}]+)}/g;
        // Заменяем закладки на специальный формат, который потом легко распарсить
        const updatedBonus = bonus.replace(bookmarkPattern, (match, p1) => {
          const keys = p1.split('/');
          let value = data.response;
          for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
              value = value[key];
            } else {
              return match; // Если ключ не найден, оставляем как есть
            }
          }
          // Формат: [видимый текст]::[текст для запроса]
          return `<b><u>${value}::${p1}</u></b>`;
        });

        setParsedBonus(updatedBonus);
      } catch (error) {
        console.error('Error fetching or processing JSON:', error);
      }
    };

    replaceBookmarks();
  }, [bonus, build]);

  // Функция для обработки нажатия и показа модального окна
  const handlePress = async (tooltipText) => {
    // Сразу ставим текст "Загрузка..."
    setModalContent('Завантаження...');
    setIsModalVisible(true);

    const { levelBase, level } = build || {};

    if (typeof levelBase === 'string' && typeof level === 'number') {
      const link = `${levelBase}${level + 1}`;

      try {
        const response = await fetch(link);
        if (!response.ok) throw new Error('Мережевий запит не вдалося виконати');
        
        const data = await response.json();

        if (data.response && typeof data.response === 'object') {
          const keys = tooltipText.split('/');
          let value = data.response;
          for (const key of keys) {
            value = value[key];
            if (value === undefined) {
              throw new Error('Ключ не знайдено в response');
            }
          }
          const finalContent = `На наступному рівні:\n${value}`;
          setModalContent(finalContent); // Обновляем контент
        } else {
          throw new Error('Response не є об\'єктом');
        }
      } catch (error) {
        console.error('Помилка при отриманні даних:', error);
        setModalContent(`Помилка: ${error.message}`); // Показываем ошибку
      }
    } else {
      setModalContent('Помилка: некоректні дані для запиту.');
    }
  };

  const normalizedBonus = parsedBonus
    ? parsedBonus.replace(/\\n/g, '\n').trim()
    : '';
  const paragraphs = normalizedBonus.split('\n\n').map(p => p.trim());

  return (
    <View style={styles.bonusContainer}>
      {/* Наше модальное окно, которое заменило Tooltip */}
      <Modal
        transparent={true}
        visible={isModalVisible}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContainer}>
                <Text style={styles.modalText}>{modalContent}</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Text style={styles.closeButton}>Закрити</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {paragraphs.length === 0 ? (
        <Text>No bonus information available</Text>
      ) : (
        paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.buildBonus}>
            {paragraph.split(/(<b><u>.*?<\/u><\/b>)/g).map((part, i) => {
              if (!/<b><u>.*<\/u><\/b>/.test(part)) {
                return <Text key={i}>{part}</Text>;
              }
              
              const cleanPart = part.replace(/<\/?b>|<\/?u>/g, '');
              const [displayText, queryText] = cleanPart.split('::');

              return (
                <TouchableOpacity key={i} onPress={() => handlePress(queryText)}>
                  <Text style={styles.highlightedText}>
                    {displayText}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Text>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bonusContainer: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 5,
    backgroundColor: '#ffffff',
  },
  buildBonus: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24, // Для лучшей читаемости
  },
  highlightedText: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    color: '#007AFF', // Сделаем кликабельные ссылки синими
  },
  // Стили для нашего кастомного модального окна
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '80%',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  closeButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: 'bold',
  },
});

export default BonusView;