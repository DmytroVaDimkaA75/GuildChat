// parser.js

import axios from 'axios';
import { parseDocument } from 'htmlparser2';
import { selectOne, selectAll } from 'css-select';

/**
 * Завантажує список країн і їхніх прапорів із сайту foe.scoredb.io
 * @returns {Promise<Array<{ name: string, flag: string | null }>>}
 */
export async function parseData() {
  try {
    const response = await axios.get('https://foe.scoredb.io/Worlds');
    const html = response.data;

    // Парсимо HTML у дерево
    const doc = parseDocument(html);

    // Знаходимо пункт меню «Servers»
    const navItems = selectAll('li.nav-item.dropdown', doc);
    const serverNav = navItems.find(item => {
      const link = selectOne('a', item);
      return link
        && link.children
          .filter(child => child.type === 'text')
          .some(textNode => textNode.data.includes('Servers'));
    });
    if (!serverNav) return [];

    // Знаходимо усі підпункти країн
    const countryDropdowns = selectAll('.dropdown-menu > .dropdown', serverNav);
    const countries = countryDropdowns.map(dropdown => {
      // Перший елемент з класом dropdown-item — це елемент із прапором і назвою країни
      const countryItem = selectAll('a.dropdown-item', dropdown)[0];
      // Отримуємо текстові вузли для назви
      const nameNode = countryItem.children.find(child => child.type === 'text');
      const name = nameNode?.data.trim() || '';

      // Знаходимо <img> для прапора
      const img = selectOne('img', countryItem);
      const rawFlag = img?.attribs?.src || null;
      // Додаємо базовий URL, якщо прапор відносний
      const flag = rawFlag ? `https://foe.scoredb.io${rawFlag}` : null;

      return { name, flag };
    });

    return countries;
  } catch (error) {
    console.error('Помилка при парсингу:', error);
    throw error;
  }
}
