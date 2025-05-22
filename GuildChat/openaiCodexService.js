export const generateCodeWithCodex = async (promptText) => {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: ` 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`, // 🔐 встав свій ключ тут або з .env
      },
      body: JSON.stringify({
        model: 'o4-mini-codex',
        messages: [
          {
            role: 'system',
            content: 'Ти досвідчений програміст, який пише ефективний код React Native.',
          },
          {
            role: 'user',
            content: promptText,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Помилка: порожня відповідь';
  } catch (error) {
    console.error('Помилка при зверненні до Codex API:', error);
    return 'Сталася помилка під час звернення до API.';
  }
};
