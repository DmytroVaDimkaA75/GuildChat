'use strict';

const puppeteer = require('puppeteer');
const {
  DEFAULT_BROWSER_URL,
  DEFAULT_GAME_ORIGIN,
  findGamePage,
  discoverFreshSequence,
  inspectSession,
  sendGameRequest,
  findGameResponse,
  sendRequestBatches,
  makeRequest,
} = require('./index');

class GameSession {
  constructor({ browser, page, endpoint, protocolHeaders, nextRequestId }) {
    this.browser = browser;
    this.page = page;
    this.endpoint = endpoint;
    this.protocolHeaders = protocolHeaders;
    this.nextRequestIdValue = nextRequestId;
    this.closed = false;
  }

  static async connect(config = {}) {
    const browserURL = config.browserURL || DEFAULT_BROWSER_URL;
    const gameOrigin = config.gameOrigin || DEFAULT_GAME_ORIGIN;
    const browser = await puppeteer.connect({ browserURL, defaultViewport: null });
    try {
      const page = await findGamePage(browser, gameOrigin);
      const sequence = await discoverFreshSequence(page, gameOrigin);
      const inspected = await inspectSession(page, sequence.endpoint);
      if (!inspected.hasSessionParameters || inspected.pageOrigin !== inspected.endpointOrigin) {
        throw new Error('Вкладка гри не має чинної сесії /game/json');
      }
      return new GameSession({
        browser,
        page,
        endpoint: sequence.endpoint,
        protocolHeaders: sequence.protocolHeaders,
        nextRequestId: sequence.nextRequestId,
      });
    } catch (error) {
      await browser.disconnect().catch(() => {});
      throw error;
    }
  }

  allocateRequest(requestClass, requestMethod, requestData = []) {
    if (this.closed) throw new Error('Ігрова сесія вже закрита');
    if (this.nextRequestIdValue >= 64000) {
      throw new Error('Послідовність requestId вичерпана; потрібне перепідключення');
    }
    return makeRequest(
      requestClass,
      requestMethod,
      requestData,
      this.nextRequestIdValue++,
    )[0];
  }

  async send(requests) {
    const list = Array.isArray(requests) ? requests : [requests];
    const result = await sendGameRequest(
      this.page,
      this.endpoint,
      list,
      this.protocolHeaders,
    );
    return Array.isArray(result.data) ? result.data : [result.data];
  }

  async sendBatches(requests, batchSize = 40, label = 'Пакети') {
    return sendRequestBatches(
      this.page,
      this.endpoint,
      requests,
      this.protocolHeaders,
      batchSize,
      label,
    );
  }

  response(messages, request) {
    return findGameResponse(messages, request);
  }

  async close({ reload = true } = {}) {
    if (this.closed) return;
    this.closed = true;
    if (reload && this.page) {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
        .catch(error => console.warn(`Не вдалося відновити вкладку гри: ${error.message}`));
    }
    await this.browser.disconnect().catch(() => {});
  }
}

module.exports = { GameSession };
