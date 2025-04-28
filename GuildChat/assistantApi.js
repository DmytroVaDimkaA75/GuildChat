import axios from 'axios';

// 🔵 Реальні ключі та IDs
const OPENAI_API_KEY = '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';
const ASSISTANT_ID     = 'asst_Ok2ItAX4E0tgL6TpQo7K2Xac';
const PROJECT_ID       = 'proj_VCwqN9jcNUY3bCXNdTkS9cbY';

// Допоміжна функція: очікуємо повідомлення від асистента
async function waitForAssistantMessage(threadId) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        }
      }
    );
    const msgs = res.data.data.reverse();
    const assistantMsg = msgs.find(
      m => m.role === 'assistant' && m.content && m.content.length
    );
    if (assistantMsg) {
      const block = assistantMsg.content[0];
      if (block.type === 'text') {
        return block.text.value;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return 'Немає відповіді.';
}

// Основна функція виклику асистента
export async function callAssistant(userMessage) {
  try {
    // 1) Створюємо тред
    const threadRes = await axios.post(
      'https://api.openai.com/v1/threads',
      {},
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        }
      }
    );
    const threadId = threadRes.data.id;

    // 2) Надсилаємо повідомлення користувача
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      { role: 'user', content: userMessage },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        }
      }
    );

    // 3) Запускаємо асистента
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        assistant_id: ASSISTANT_ID,
        tools: [{ type: 'file_search' }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Project': PROJECT_ID,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        }
      }
    );
    const runId = runRes.data.id;

    // 4) Чекаємо завершення run
    let status = 'in_progress';
    while (status === 'in_progress') {
      const stat = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Project': PROJECT_ID,
            'OpenAI-Beta': 'assistants=v2',
            'Content-Type': 'application/json'
          }
        }
      );
      status = stat.data.status;
      if (status === 'completed') break;
      await new Promise(r => setTimeout(r, 1000));
    }

    // 5) Отримуємо остаточну відповідь
    return await waitForAssistantMessage(threadId);
  } catch (error) {
    console.error(
      '❌ assistantApi ERROR:',
      error.response?.data || error.message
    );
    return 'Помилка при зверненні до асистента.';
  }
}
