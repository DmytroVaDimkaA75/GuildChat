// components/FoeSync/rawEntity.js
//
// Сирі дані однієї будівлі: як її надіслала гра (entity) і що вдалося
// довантажити з довідника (definition). Спільне для мапи й таблиці виробництв.

// Довгий текст обрізаємо — вікно деталей не місце для кількох екранів JSON.
const RAW_LIMIT = 6000;

export function formatRawEntity(entity, definition) {
  try {
    const text = JSON.stringify({ entity, definition }, null, 2);
    return text.length > RAW_LIMIT
      ? `${text.slice(0, RAW_LIMIT)}\n… (обрізано, всього ${text.length} символів)`
      : text;
  } catch (_error) {
    return 'Не вдалося показати сирі дані цієї будівлі.';
  }
}

export default formatRawEntity;
