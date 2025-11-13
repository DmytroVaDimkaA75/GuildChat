// worldParser.js

import axios from 'axios';
import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from 'css-select';

/**
 * Парсить список світів для обраної країни
 * @param {string} selectedCountryName - назва країни (як у меню)
 * @returns {Promise<Array<{ name: string, url: string }>>}
 */
export async function parseDataNew(selectedCountryName) {
  try {
    // Завантажуємо HTML-сторінку
    const response = await axios.get('https://foe.scoredb.io/Worlds');
    const html = response.data;

    // Розбираємо HTML у структуру документу
    const doc = parseDocument(html);

    // Шукаємо усі блоки країн у меню
    const countryBlocks = selectAll('.dropdown-menu > .dropdown', doc);

    // Знаходимо блок для обраної країни
    const targetBlock = countryBlocks.find(block => {
      const label = selectOne('> a.dropdown-item', block);
      return label?.children.some(
        node => node.type === 'text' && node.data.includes(selectedCountryName)
      );
    });

    if (!targetBlock) {
      return [];
    }

    // Знаходимо вкладене меню світів всередині цього блоку
    const worldsMenu = selectOne('> .dropdown-menu', targetBlock);
    if (!worldsMenu) {
      return [];
    }

    // Парсимо усі посилання на світи
    const links = selectAll('a.dropdown-item', worldsMenu);
    const worlds = links.map(link => {
      // Назва світу
      const textNode = link.children.find(child => child.type === 'text');
      const name = textNode?.data.trim() || '';

      // Формуємо короткий URL
      let url = link.attribs.href || '';
      url = url.substring(url.lastIndexOf('/') + 1);

      return { name, url };
    });

    return worlds;
  } catch (error) {
    console.error('Помилка при парсингу світів:', error);
    throw error;
  }
}
