'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { DEFAULT_BROWSER_URL, DEFAULT_GAME_ORIGIN, findGamePage } = require('./index');

const CONCURRENCY = 20;
const RETRIES = 3;

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function findLookupUrl() {
  const browser = await puppeteer.connect({
    browserURL: process.env.FOE_BROWSER_URL || DEFAULT_BROWSER_URL,
    defaultViewport: null,
  });
  try {
    const page = await findGamePage(browser, process.env.FOE_GAME_ORIGIN || DEFAULT_GAME_ORIGIN);
    const url = await page.evaluate(() => performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .find(value => value.includes('building_entity_lookup-')) || null);
    if (!url) throw new Error('У вкладці гри не знайдено BuildingEntityLookup');
    return url;
  } finally {
    await browser.disconnect();
  }
}

async function main() {
  const lookupUrl = await findLookupUrl();
  const lookup = await fetchJson(lookupUrl);
  if (!Array.isArray(lookup) || lookup.length === 0) {
    throw new Error('BuildingEntityLookup має неочікуваний формат');
  }

  const buildings = new Array(lookup.length);
  const failures = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= lookup.length) return;
      const row = lookup[index];
      try {
        buildings[index] = await fetchJson(row.url);
      } catch (error) {
        failures.push({ identifier: row.identifier, url: row.url, error: error.message });
      }
      completed += 1;
      if (completed % 100 === 0 || completed === lookup.length) {
        console.log(`Завантажено ${completed}/${lookup.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const successful = buildings.filter(Boolean);
  const duplicateIds = successful
    .map(building => building.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  const report = {
    capturedAt: new Date().toISOString(),
    source: lookupUrl,
    buildingCount: successful.length,
    failedCount: failures.length,
    duplicateIds: [...new Set(duplicateIds)],
    failures,
    buildings: successful,
  };

  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, 'all-game-buildings.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Споруд: ${report.buildingCount}; помилок: ${report.failedCount}`);
  console.log(`Результат: ${outputPath}`);
  if (failures.length > 0 || duplicateIds.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
