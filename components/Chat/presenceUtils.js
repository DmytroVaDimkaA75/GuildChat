import { format, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

const fallbackLabel = 'Активність: ніколи';

export const formatLastActive = (presence, locale = uk) => {
  const timestamp = Number(presence?.lastChanged);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
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

export const getPresenceStatusLabel = (presence, locale = uk) => {
  if (presence?.state === 'online') {
    return 'У мережі';
  }

  return formatLastActive(presence, locale);
};
