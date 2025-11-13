// parsePlayerBlock.js

import { parseDocument } from 'htmlparser2';
import { selectOne } from 'css-select';

/**
 * Парсер блоку гравця з HTML
 *
 * @param {string} html – рядок із HTML-кодом
 * @returns { { userName: string|null, avatarUrl: string|null, guildId: string|null, guildName: string|null } | null }
 */
export function parsePlayerBlock(html) {
  // Розбираємо HTML в документ
  const doc = parseDocument(html);

  // Знаходимо контейнер з аватаркою і гільдією
  const container = selectOne('.avatar-thumbnail.avatar-frame', doc);
  if (!container) return null;

  // Ім’я користувача
  const nameElem = selectOne('h6.avatar-caption b', container);
  const userName = nameElem?.children?.[0]?.data?.trim() || null;

  // URL аватарки
  const imgElem = selectOne('img.player-clan-avatar', container);
  const avatarUrl = imgElem?.attribs?.src || null;

  // Параметри гільдії
  const linkElem = selectOne('a[href*="/Guild/"]', container);
  const href = linkElem?.attribs?.href || '';
  const guildId = href.split('/Guild/')[1] || null;
  const guildName = linkElem?.children?.[0]?.data?.trim() || null;

  return {
    userName,
    avatarUrl,
    guildId,
    guildName
  };
}
