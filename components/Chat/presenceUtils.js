import { format, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

const fallbackLabel = 'Активність: ніколи';

const normalizeTimestamp = (value) => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
};

export const formatLastActive = (presence, locale = uk, knownActivityTimestamp = 0) => {
  const timestamp = Math.max(
    normalizeTimestamp(presence?.lastChanged),
    normalizeTimestamp(presence?.lastActivityAt),
    normalizeTimestamp(knownActivityTimestamp)
  );
  if (!timestamp) {
    return fallbackLabel;
  }

  const date = new Date(timestamp);
  const timePart = format(date, 'HH:mm', { locale });

  if (isToday(date)) {
    return `Активність: сьогодні о ${timePart}`;
  }

  if (isYesterday(date)) {
    return `Активність: вчора о ${timePart}`;
  }

  return `Активність: ${format(date, 'dd.MM.yyyy', { locale })} о ${timePart}`;
};

export const getPresenceStatusLabel = (presence, locale = uk, knownActivityTimestamp = 0) => {
  if (presence?.state === 'online') {
    return 'У мережі';
  }

  return formatLastActive(presence, locale, knownActivityTimestamp);
};
