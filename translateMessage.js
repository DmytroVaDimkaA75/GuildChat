import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const translateMessage = async (text, locale) => {
const key = "3d21dac4f6434896ab3ad41f8fd0c4c3";  // Ваш ключ
const endpoint = "https://api.cognitive.microsofttranslator.com";
const location = "westeurope";  // Ваша локація

try {
const response = await axios({
baseURL: endpoint,
url: '/translate',
method: 'post',
headers: {
'Ocp-Apim-Subscription-Key': key,
'Ocp-Apim-Subscription-Region': location,
'Content-Type': 'application/json',
'X-ClientTraceId': uuidv4().toString()
},
params: {
'api-version': '3.0',
'to': locale
},
data: [{ 'text': text }],
responseType: 'json'
});

// Повертаємо перекладений текст
const translatedText = response.data[0].translations[0].text;
return translatedText;
} catch (err) {
// Обробка помилки
console.error('Error translating message:');
console.error('Request details:');
console.error({
url: `${endpoint}/translate`,
method: 'POST',
headers: {
'Ocp-Apim-Subscription-Key': key,
'Ocp-Apim-Subscription-Region': location,
'Content-Type': 'application/json'
},
params: {
'api-version': '3.0',
'to': locale
},
data: [{ 'text': text }]
});
console.error('Error response:', err.response ? err.response.data : err.message);
throw err; // Можна змінити це на інший спосіб обробки помилок
}
};

export default translateMessage;