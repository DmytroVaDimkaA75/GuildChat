import axios from 'axios';

const generateTraceId = () => {
  const randomPart = Math.random().toString(16).slice(2);
  const timePart = Date.now().toString(16);
  return `${timePart}-${randomPart}`.slice(0, 36);
};

const translatorConfig = {
  key: "3d21dac4f6434896ab3ad41f8fd0c4c3",
  endpoint: "https://api.cognitive.microsofttranslator.com",
  location: "westeurope"
};

const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}[^\s]*)/gi;

export const detectMessageLanguage = async (text) => {
  const response = await axios({
    baseURL: translatorConfig.endpoint,
    url: '/detect',
    method: 'post',
    headers: {
      'Ocp-Apim-Subscription-Key': translatorConfig.key,
      'Ocp-Apim-Subscription-Region': translatorConfig.location,
      'Content-Type': 'application/json',
      'X-ClientTraceId': generateTraceId()
    },
    params: { 'api-version': '3.0' },
    data: [{ text }],
    responseType: 'json'
  });

  return response.data?.[0]?.language || null;
};

const translateMessage = async (text, locale) => {
try {
const parts = String(text || '').split(urlPattern);
const textPartIndexes = [];
const requestData = [];

parts.forEach((part, index) => {
  if (part && !part.match(new RegExp(`^(?:${urlPattern.source})$`, 'i')) && part.trim()) {
    textPartIndexes.push(index);
    requestData.push({ text: part });
  }
});

if (!requestData.length) return text;

const response = await axios({
baseURL: translatorConfig.endpoint,
url: '/translate',
method: 'post',
headers: {
'Ocp-Apim-Subscription-Key': translatorConfig.key,
'Ocp-Apim-Subscription-Region': translatorConfig.location,
'Content-Type': 'application/json',
'X-ClientTraceId': generateTraceId()
},
params: {
'api-version': '3.0',
'to': locale
},
data: requestData,
responseType: 'json'
});

textPartIndexes.forEach((partIndex, responseIndex) => {
  parts[partIndex] = response.data?.[responseIndex]?.translations?.[0]?.text || parts[partIndex];
});
return parts.join('');
} catch (err) {
// Обробка помилки
console.error('Error translating message:');
console.error('Request details:');
console.error({
url: `${translatorConfig.endpoint}/translate`,
method: 'POST',
headers: {
'Ocp-Apim-Subscription-Key': translatorConfig.key,
'Ocp-Apim-Subscription-Region': translatorConfig.location,
'Content-Type': 'application/json'
},
params: {
'api-version': '3.0',
'to': locale
},
data: [{ text: '[text fragments with URLs omitted]' }]
});
console.error('Error response:', err.response ? err.response.data : err.message);
throw err; // Можна змінити це на інший спосіб обробки помилок
}
};

export default translateMessage;
