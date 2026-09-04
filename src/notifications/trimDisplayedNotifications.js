// Android дозволяє додатку тримати щонайбільше 50 активних сповіщень у "шторці".
// Коли їх стає 50, система тихо перестає показувати нові — а лічильник на іконці
// застигає близько 49. Тут ми самі прибираємо найстаріші сповіщення, щойно їх
// назбирується забагато, щоб завжди лишався запас.

import notifee from '@notifee/react-native';

// Скільки сповіщень лишаємо максимум. 24 << 50 — вистачає запасу навіть коли
// пачка пушів приходить майже одночасно.
const MAX_DISPLAYED = 24;

let trimInFlight = null;

const deliveredAt = (entry) => {
  const candidates = [
    entry?.date,
    entry?.notification?.android?.timestamp,
    entry?.notification?.data?.sentAt,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const runTrim = async () => {
  const displayed = await notifee.getDisplayedNotifications();
  if (!Array.isArray(displayed) || displayed.length <= MAX_DISPLAYED) return;

  // Найстаріші — на початку. Записи без часу вважаємо найстарішими.
  const ordered = displayed
    .map((entry, index) => ({ entry, index, at: deliveredAt(entry) }))
    .sort((a, b) => (a.at - b.at) || (a.index - b.index));

  const excess = ordered.slice(0, ordered.length - MAX_DISPLAYED);
  await Promise.all(
    excess
      .map(({ entry }) => entry?.id)
      .filter(Boolean)
      .map((id) => notifee.cancelDisplayedNotification(id))
  );
};

// Прибрати зайві сповіщення. Викликати після кожного нового пуша та коли
// додаток виходить на передній план. Безпечно викликати часто — паралельні
// виклики зливаються в один.
export const trimDisplayedNotifications = () => {
  if (trimInFlight) return trimInFlight;
  trimInFlight = runTrim()
    .catch((error) => {
      console.log(
        '❌ Не вдалося прибрати старі сповіщення:',
        error?.message || String(error)
      );
    })
    .finally(() => {
      trimInFlight = null;
    });
  return trimInFlight;
};
