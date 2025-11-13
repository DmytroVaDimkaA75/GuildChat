// guildParser.js

import axios from 'axios';
import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from 'css-select';

/**
 * Парсить дані членів гільдії з заданої URL-адреси
 * @param {string} url - адреса сторінки гільдії
 * @returns {Promise<{ success: boolean, data?: Array<{ name: string, imageUrl: string|null, linkUrl: string|null, battles: string|null, points: string|null }>, clanCaption?: string, error?: string }>} */
export async function parseGuildData(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;

    // Розбираємо HTML у документ
    const doc = parseDocument(html);

    // Збираємо дані про учасників
    const rows = selectAll('table.table tbody tr:nth-child(even)', doc);
    const guildData = rows.map(row => {
      const nameElem = selectOne('td:nth-child(2) a', row);
      const imgElem = selectOne('td:nth-child(2) a img', row);
      const linkElem = selectOne('td:nth-child(2) a', row);
      const battlesElem = selectOne('td:nth-child(3) i', row);
      const pointsElem = selectOne('td:nth-child(3) i', row);

      const name = nameElem?.children?.find(c => c.type === 'text')?.data.trim() || '';
      const imageUrl = imgElem?.attribs?.src || null;
      const linkUrl = linkElem?.attribs?.href || null;
      const battles = battlesElem?.attribs?.['data-battles'] || null;
      const points = pointsElem?.attribs?.['data-points'] || null;

      return { name, imageUrl, linkUrl, battles, points };
    });

    // Парсимо підпис гільдії
    const captionElem = selectOne('h6.small.avatar-clan-caption b', doc);
    const clanCaption = captionElem?.children?.find(c => c.type === 'text')?.data.trim() || '';

    return { success: true, data: guildData, clanCaption };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
