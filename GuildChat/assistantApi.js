import axios from 'axios';

// 🔵 Реальні ключі та IDs
export const OPENAI_API_KEY = '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';
export const ASSISTANT_IDS = {
  Vikings:   'asst_GdHkDkEaETjOz526lFXaa2LL',
  Japan:     'asst_Tvf4Dqgvbyc1RgyrC2CGFLmp',
  Egypt:     'asst_5aMYozfsI96RQ0r0Exw2FLoa',
  Aztecs:    'asst_OiTqjOUq2vsMuGAjKBheenz3',
  Mughal:    'asst_TeeYBcJlqUXaMXjdWcsRkfnc',
  Polynesia: 'asst_vrn0L2FZaZN5aokSsJjkEGSl',
};
export const PROJECT_ID       = 'proj_IzzfAQLpr0LnVCgetnkzEtCs';

// Допоміжна функція: очікуємо повідомлення від асистента
async function waitForAssistantMessage(threadId) {
  for (let attempt = 0; attempt < 10; attempt++) {
    console.log(`[assistantApi] Очікування відповіді, спроба ${attempt + 1}`);
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
    console.log('[assistantApi] Отримано повідомлень:', msgs.length);
    const assistantMsg = msgs.find(
      m => m.role === 'assistant' && m.content && m.content.length
    );
    if (assistantMsg) {
      const block = assistantMsg.content[0];
      if (block.type === 'text') {
        console.log('[assistantApi] Відповідь асистента:', block.text.value);
        return block.text.value;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('[assistantApi] Відповідь не отримано.');
  return 'Немає відповіді.';
}

// Основна функція виклику асистента
export async function callAssistant(userMessage, assistantId) {
  try {
    console.log('[assistantApi] Виклик асистента:', { userMessage, assistantId });

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
    console.log('[assistantApi] Створено thread:', threadId);

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
    console.log('[assistantApi] Повідомлення користувача надіслано');

    // 3) Запускаємо асистента
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        assistant_id: assistantId,
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
    console.log('[assistantApi] Run запущено:', runId);

    // 4) Чекаємо завершення run
    let status = 'in_progress';
    let statusChecks = 0;
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
      statusChecks++;
      console.log(`[assistantApi] Run статус (${statusChecks}):`, status);
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
