import moment from 'moment-timezone';

const DEFAULT_SERVER_TIME_ZONE = 'UTC';
const SERVER_TIME_ZONES = { ru: 'Europe/Moscow' };

export const DEFAULT_AUTOMATIC_TASK_LEAD_MINUTES = 24 * 60;

export const AUTOMATIC_TASK_DEFINITIONS = [
  {
    key: 'gbgStart',
    idPrefix: 'automatic-gbg-start',
    firstAppearanceAt: '2026-07-29T08:00:00',
    title: 'Початок ПБГ',
    text: 'о 8:00 починаються ПБГ',
    systemIcon: 'gbg',
    color: '#4ea1ff',
  },
  {
    key: 'quantumInvasions',
    idPrefix: 'automatic-quantum-invasions',
    firstAppearanceAt: '2026-08-05T08:00:00',
    title: 'Квантові вторгнення',
    text: 'о 8:00 починаються квантові вторгнення, підвищіть рівні споруд для збільшення бонусів',
    systemIcon: 'quantum',
    color: '#8b65d6',
  },
];

const getServerRegion = (guildId) => {
  const worldId = String(guildId || '').split('_')[0];
  return worldId.match(/^[a-z]+/i)?.[0]?.toLowerCase() || '';
};

export const getServerTimeZone = (guildId) => (
  SERVER_TIME_ZONES[getServerRegion(guildId)] || DEFAULT_SERVER_TIME_ZONE
);

const normalizeLeadMinutes = (value) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0
    ? Math.round(minutes)
    : DEFAULT_AUTOMATIC_TASK_LEAD_MINUTES;
};

const getNextOccurrence = (definition, nowMs, serverTimeZone) => {
  const firstOccurrence = moment.tz(definition.firstAppearanceAt, serverTimeZone);
  if (nowMs <= firstOccurrence.valueOf()) return firstOccurrence;

  const elapsedDays = moment(nowMs).tz(serverTimeZone).diff(firstOccurrence, 'days', true);
  const completedCycles = Math.floor(elapsedDays / 14);
  const occurrence = firstOccurrence.clone().add(completedCycles * 14, 'days');
  return occurrence.valueOf() >= nowMs ? occurrence : occurrence.add(14, 'days');
};

const getPreviousOrCurrentOccurrence = (definition, nowMs, serverTimeZone) => {
  const firstOccurrence = moment.tz(definition.firstAppearanceAt, serverTimeZone);
  if (nowMs < firstOccurrence.valueOf()) return null;
  const elapsedDays = moment(nowMs).tz(serverTimeZone).diff(firstOccurrence, 'days', true);
  return firstOccurrence.clone().add(Math.floor(elapsedDays / 14) * 14, 'days');
};

const getLeadMinutes = (settings, definition) => normalizeLeadMinutes(
  settings?.[definition.key]?.showBeforeMinutes
);

const getTaskText = (settings, definition) => {
  const savedText = settings?.[definition.key]?.text;
  return typeof savedText === 'string' && savedText.trim()
    ? savedText.trim()
    : definition.text;
};

export const getAutomaticTaskTemplates = (nowMs = Date.now(), guildId = '', settings = {}) => {
  const serverTimeZone = getServerTimeZone(guildId);
  return AUTOMATIC_TASK_DEFINITIONS.map((definition) => {
    const nextOccurrence = getNextOccurrence(definition, nowMs, serverTimeZone);
    return {
      id: `template-${definition.key}`,
      templateKey: definition.key,
      title: definition.title,
      description: getTaskText(settings, definition),
      audience: 'Уся гільдія',
      filter: 'Гільдія',
      status: 'Автоматичне',
      due: `Наступний початок: ${nextOccurrence.format('DD.MM.YYYY, HH:mm')}`,
      nextOccurrenceAt: nextOccurrence.valueOf(),
      showBeforeMinutes: getLeadMinutes(settings, definition),
      progress: 0,
      progressLabel: '',
      systemIcon: definition.systemIcon,
      color: definition.color,
      automatic: true,
      template: true,
    };
  });
};

export const getActiveAutomaticTasks = (nowMs = Date.now(), guildId = '', settings = {}) => {
  const serverTimeZone = getServerTimeZone(guildId);
  return AUTOMATIC_TASK_DEFINITIONS.map((definition) => {
    const nextOccurrence = getNextOccurrence(definition, nowMs, serverTimeZone);
    const currentOccurrence = getPreviousOrCurrentOccurrence(definition, nowMs, serverTimeZone);
    const showBeforeMinutes = getLeadMinutes(settings, definition);
    const candidate = currentOccurrence
      && nowMs < currentOccurrence.clone().add(24, 'hours').valueOf()
      ? currentOccurrence
      : nextOccurrence;
    const visibleFrom = candidate.clone().subtract(showBeforeMinutes, 'minutes');
    const disappearsAt = candidate.clone().add(24, 'hours');
    if (nowMs < visibleFrom.valueOf() || nowMs >= disappearsAt.valueOf()) return null;

    const serverNow = moment(nowMs).tz(serverTimeZone);
    const startsInFuture = nowMs < candidate.valueOf();
    const dayWord = startsInFuture
      ? (serverNow.isSame(candidate, 'day') ? 'Сьогодні' : 'Незабаром')
      : 'Сьогодні';
    return {
      id: `${definition.idPrefix}-${candidate.format('YYYY-MM-DD')}`,
      title: definition.title,
      description: `${dayWord} ${getTaskText(settings, definition)}`,
      audience: 'Уся гільдія',
      filter: 'Гільдія',
      status: 'Автоматичне',
      due: `Початок: ${candidate.format('DD.MM.YYYY, HH:mm')}`,
      progress: 0,
      progressLabel: '',
      systemIcon: definition.systemIcon,
      color: definition.color,
      automatic: true,
    };
  }).filter(Boolean);
};
