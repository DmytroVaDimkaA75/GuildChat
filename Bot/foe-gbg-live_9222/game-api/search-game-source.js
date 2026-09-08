'use strict';

const puppeteer = require('puppeteer');
const { DEFAULT_BROWSER_URL, DEFAULT_GAME_ORIGIN, findGamePage } = require('./index');

const terms = process.argv.slice(2);
if (!terms.length) throw new Error('Вкажіть рядки пошуку');

(async () => {
  const browser = await puppeteer.connect({
    browserURL: process.env.FOE_BROWSER_URL || DEFAULT_BROWSER_URL,
    defaultViewport: null,
  });
  try {
    const page = await findGamePage(browser, process.env.FOE_GAME_ORIGIN || DEFAULT_GAME_ORIGIN);
    if (terms.length === 1 && terms[0] === '--resources') {
      const resources = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => entry.name));
      console.log(JSON.stringify(resources, null, 2));
      return;
    }
    if (terms.length === 2 && terms[0] === '--fetch-resource') {
      const result = await page.evaluate(async pattern => {
        const url = performance.getEntriesByType('resource')
          .map(entry => entry.name)
          .find(value => value.includes(pattern));
        if (!url) return null;
        return { url, data: await (await fetch(url)).json() };
      }, terms[1]);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const matches = await page.evaluate(async searchTerms => {
      const urls = [...new Set(performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(url => /\.js(?:\?|$)/i.test(url)))];
      const found = [];
      for (const url of urls) {
        let source;
        try {
          source = await (await fetch(url)).text();
        } catch (_) {
          continue;
        }
        for (const term of searchTerms) {
          let offset = 0;
          while ((offset = source.indexOf(term, offset)) !== -1 && found.length < 200) {
            found.push({
              url,
              term,
              snippet: source.slice(Math.max(0, offset - 300), offset + term.length + 500),
            });
            offset += term.length;
          }
        }
      }
      return found;
    }, terms);
    console.log(JSON.stringify(matches, null, 2));
  } finally {
    await browser.disconnect();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
