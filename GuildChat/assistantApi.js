import axios from 'axios';

// 🔵 Константи (твої реальні дані)
const OPENAI_API_KEY = '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';
const ASSISTANT_ID = 'asst_Ok2ItAX4E0tgL6TpQo7K2Xac';
const PROJECT_ID = 'proj_VCwqN9jcNUY3bCXNdTkS9cbY';

// 🔵 Допоміжна функція: Очікуємо реальне повідомлення від асистента
async function waitForAssistantMessage(threadId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const messagesResponse = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );

    const allMessages = messagesResponse.data.data;
    const assistantMessage = allMessages.reverse().find(
      msg => msg.role === 'assistant' && msg.content && msg.content.length > 0
    );

    if (assistantMessage) {
      const firstContent = assistantMessage.content[0];
      if (firstContent.type === 'text') {
        return firstContent.text.value;
      }
    }

    // Якщо відповіді ще немає — чекаємо 2 секунди і пробуємо ще раз
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return 'Немає відповіді.';
}

// 🔵 Основна функція: Виклик асистента
export async function callAssistant(userMessage) {
  try {
    // 1️⃣ Створення нового треду
    const threadResponse = await axios.post(
      'https://api.openai.com/v1/threads',
      {},
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );
    const threadId = threadResponse.data.id;

    // 2️⃣ Додаємо повідомлення користувача
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: 'user',
        content: userMessage,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );

    // 3️⃣ Запускаємо асистента з доступом до файлів
    const runResponse = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        assistant_id: ASSISTANT_ID,
        tools: [{ type: 'file_search' }],
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );
    const runId = runResponse.data.id;

    // 4️⃣ Чекаємо завершення обробки
    let status = 'in_progress';
    while (status === 'in_progress') {
      const statusResponse = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Project': PROJECT_ID,
            'OpenAI-Beta': 'assistants=v2',
            'Content-Type': 'application/json',
          },
        }
      );

      status = statusResponse.data.status;

      if (status === 'completed') {
        // Додаткова пауза після завершення Run
        await new Promise(resolve => setTimeout(resolve, 1500));
        break;
      }

      
      // Пауза перед наступною перевіркою статусу
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 5️⃣ Після завершення — чекаємо реальну відповідь
    const assistantReply = await waitForAssistantMessage(threadId);
    return assistantReply;

  } catch (error) {
    console.error('Помилка при зверненні до асистента:', error.response?.data || error.message);
    return 'Помилка при зверненні до асистента.';
  }
}
