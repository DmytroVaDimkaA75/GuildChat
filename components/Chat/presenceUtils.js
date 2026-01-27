import { format, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

const fallbackLabel = 'Був(ла) нещодавно';

export const formatLastActive = (presence, locale = uk) => {
  const timestamp = Number(presence?.lastChanged);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return fallbackLabel;
  }

  const date = new Date(timestamp);
  const timePart = format(date, 'HH:mm', { locale });

  if (isToday(date)) {
    return `Був(ла) сьогодні о ${timePart}`;
  }

  if (isYesterday(date)) {
    return `Був(ла) вчора о ${timePart}`;
  }

  return `Був(ла) ${format(date, 'dd.MM.yyyy', { locale })} о ${timePart}`;
};

export const getPresenceStatusLabel = (presence, locale = uk) => {
  if (presence?.state === 'online') {
    return 'У мережі';
  }

  return formatLastActive(presence, locale);
};
