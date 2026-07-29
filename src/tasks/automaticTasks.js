import moment from 'moment-timezone';

const DEFAULT_SERVER_TIME_ZONE = 'UTC';
const SERVER_TIME_ZONES = {
  ru: 'Europe/Moscow',
};
const QUANTUM_INVASIONS_FIRST_APPEARANCE = '2026-08-05T08:00:00';
const GBG_START_FIRST_APPEARANCE = '2026-07-29T08:00:00';

const getServerRegion = (guildId) => {
  const worldId = String(guildId || '').split('_')[0];
  return worldId.match(/^[a-z]+/i)?.[0]?.toLowerCase() || '';
};

export const getServerTimeZone = (guildId) => (
  SERVER_TIME_ZONES[getServerRegion(guildId)] || DEFAULT_SERVER_TIME_ZONE
);

const getFortnightlyTask = ({
  nowMs,
  serverTimeZone,
  firstAppearanceAt,
  idPrefix,
  title,
  text,
  icon,
  color,
}) => {
  const firstAppearance = moment.tz(firstAppearanceAt, serverTimeZone);
  const nowOnServer = moment(nowMs).tz(serverTimeZone);
  const daysFromFirstAppearance = nowOnServer
    .clone()
    .startOf('day')
    .diff(firstAppearance.clone().startOf('day'), 'days');

  if (daysFromFirstAppearance < 0) return null;

  const cycleNumber = Math.floor(daysFromFirstAppearance / 14);
  const appearanceAt = firstAppearance.clone().add(cycleNumber * 14, 'days');
  const disappearsAt = appearanceAt.clone().add(24, 'hours');

  if (nowMs < appearanceAt.valueOf() || nowMs >= disappearsAt.valueOf()) {
    return null;
  }

  const dayWord = nowOnServer.isSame(appearanceAt, 'day') ? 'Завтра' : 'Сьогодні';

  return {
    id: `${idPrefix}-${appearanceAt.format('YYYY-MM-DD')}`,
    title,
    description: `${dayWord} ${text}`,
    audience: 'Уся гільдія',
    filter: 'Гільдія',
    status: 'Автоматичне',
    due: `До ${disappearsAt.format('DD.MM, HH:mm')}`,
    progress: 0,
    progressLabel: '',
    icon,
    color,
    automatic: true,
  };
};

const getQuantumInvasionsTask = (nowMs, serverTimeZone) => (
  getFortnightlyTask({
    nowMs,
    serverTimeZone,
    firstAppearanceAt: QUANTUM_INVASIONS_FIRST_APPEARANCE,
    idPrefix: 'automatic-quantum-invasions',
    title: 'Квантові вторгнення',
    text: 'о 8:00 починаються квантові вторгнення, підвищіть рівні споруд для збільшення бонусів',
    icon: 'atom',
    color: '#8b65d6',
  })
);

const getGbgStartTask = (nowMs, serverTimeZone) => (
  getFortnightlyTask({
    nowMs,
    serverTimeZone,
    firstAppearanceAt: GBG_START_FIRST_APPEARANCE,
    idPrefix: 'automatic-gbg-start',
    title: 'Початок ПБГ',
    text: 'о 8:00 починаються ПБГ',
    icon: 'sword-cross',
    color: '#4ea1ff',
  })
);

export const getActiveAutomaticTasks = (nowMs = Date.now(), guildId = '') => {
  const serverTimeZone = getServerTimeZone(guildId);
  const tasks = [
    getQuantumInvasionsTask(nowMs, serverTimeZone),
    getGbgStartTask(nowMs, serverTimeZone),
  ];
  return tasks.filter(Boolean);
};
