# Підтверджені кейси гаранта

## G-001 — Пропорційний внесок на перше місце при порожній ВС

Статус: підтверджено.

### Вхідний JSON

Для аналізу використано лише актуальний стан. Поле `lastScan` навмисно виключено відповідно до вказівки користувача.

```json
{
  "contributors": {
    "851419219": {
      "avatar": "portrait_id_16",
      "forgePoints": 748,
      "playerName": "PASSAT B6",
      "rank": 1
    }
  },
  "guarant": {
    "coefficient": 2,
    "nominalCost": 760,
    "placeCost": 1520,
    "placeNumber": 1,
    "proportionalPool": 2104,
    "recommendedDeposit": 1232,
    "remainingFp": 2105,
    "status": "empty_urgent_proportional_deposit",
    "sumEmptyPlaceCosts": 2597,
    "totalFp": 2853,
    "weightSum": 2597,
    "ownerClosingFp": 1,
    "oneFpPlacesCount": 0,
    "developerDebug": {
      "ownerDeposit": 748,
      "places": [
        { "placeNumber": 1, "nominalCost": 760, "coefficient": 2, "placeCost": 1520 },
        { "placeNumber": 2, "nominalCost": 380, "coefficient": 2, "placeCost": 760 },
        { "placeNumber": 3, "nominalCost": 125, "coefficient": 2, "placeCost": 250 },
        { "placeNumber": 4, "nominalCost": 30, "coefficient": 1.9, "placeCost": 57 },
        { "placeNumber": 5, "nominalCost": 5, "coefficient": 1.9, "placeCost": 10 }
      ]
    }
  },
  "level": 59,
  "status": "active"
}
```

### Розрахунок

- Залишок: `2853 − 748 = 2105 СО`.
- Резерв власника на закриття: `1 СО`.
- Пропорційний пул: `2105 − 1 = 2104 СО`.
- Сума ваг: `1520 + 760 + 250 + 57 + 10 = 2597`.
- Перше місце: `ceil(2104 × 1520 / 2597) = ceil(1231.4517…) = 1232 СО`.

### Очікуваний результат і рекомендація

- Статус: `empty_urgent_proportional_deposit`.
- Діє: учасник гільдії.
- Внесок: `1232 СО`.
- Ціль: 1-ше місце.
- Після внеску учасник має `1232 СО`, випереджає внесок власника `748 СО` на `484 СО`; власник не займає гарантованого призового місця.
- Залишок після внеску: `873 СО`, з яких `1 СО` зарезервовано власнику на закриття.

### Застосовані правила

- R-001.

## G-002 — Кінцевий внесок для перебиття стороннього на четвертому місці

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "244096": { "playerName": "Tertiadecima", "forgePoints": 56, "rank": 4 },
    "274084": { "playerName": "иван2000", "forgePoints": 50, "rank": 5 },
    "3389246": { "playerName": "Макс Чайка 999", "forgePoints": 1230, "rank": 1 },
    "3758137": { "playerName": "Джеминист", "forgePoints": 48, "rank": 5 },
    "9838093": { "playerName": "Lymon", "forgePoints": 210, "rank": 3 },
    "851646354": { "playerName": "cavalo escuro", "forgePoints": 620, "rank": 2 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 50,
      "places": [
        { "placeNumber": 1, "placeCost": 1230, "occupant": { "playerName": "Макс Чайка 999", "forgePoints": 1230, "membership": "guild_member" } },
        { "placeNumber": 2, "placeCost": 620, "occupant": { "playerName": "cavalo escuro", "forgePoints": 620, "membership": "guild_member" } },
        { "placeNumber": 3, "placeCost": 210, "occupant": { "playerName": "Lymon", "forgePoints": 210, "membership": "guild_member" } },
        { "placeNumber": 4, "placeCost": 48, "occupant": { "playerName": "Tertiadecima", "forgePoints": 56, "membership": "outsider" } },
        { "placeNumber": 5, "placeCost": 10, "occupant": { "playerName": "Джеминист", "forgePoints": 48, "membership": "outsider" } }
      ]
    },
    "placeNumber": 4,
    "remainingFp": 134,
    "status": "outsider_without_guild_challenger",
    "totalFp": 2348
  },
  "level": 61,
  "status": "active"
}
```

### Розрахунок

- Сторонній вкладник на четвертому місці: `56 СО`.
- Залишок до нового внеску: `134 СО`.
- Простий внесок `57 СО` залишив би `77 СО` і не гарантував би місце: `56 + 77 > 57`.
- Кінцевий внесок: `max(56 + 1, ceil((56 + 134) / 2)) = max(57, 95) = 95 СО`.
- Після внеску залишається `39 СО`; максимум стороннього становить `56 + 39 = 95 СО`, а рівність не є перебиттям.

### Очікуваний результат і рекомендація

- Спочатку отримати дозвіл власника ВС на перебиття.
- Після дозволу показати ВС на екрані «Гаранти».
- Новий учасник гільдії вносить `95 СО` на четверте місце.
- Очікуваний внесок на четвертому місці після дії: `95 СО`.
- При забороні власника не показувати ВС на екрані «Гаранти».

### Застосовані правила

- R-002.

## G-003 — Неперебивне перше місце та гарантоване друге

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "244096": { "playerName": "Tertiadecima", "forgePoints": 11, "rank": 2 },
    "274084": { "playerName": "иван2000", "forgePoints": 650, "rank": 2 },
    "850585903": { "playerName": "Strannik888", "forgePoints": 1539, "rank": 1 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 650,
      "places": [
        { "placeNumber": 1, "nominalCost": 810, "coefficient": 2, "placeCost": 1620, "occupant": { "playerName": "Strannik888", "forgePoints": 1539, "membership": "outsider" } },
        { "placeNumber": 2, "nominalCost": 405, "coefficient": 2, "placeCost": 810 },
        { "placeNumber": 3, "nominalCost": 135, "coefficient": 2, "placeCost": 270 },
        { "placeNumber": 4, "nominalCost": 35, "coefficient": 1.9, "placeCost": 67 },
        { "placeNumber": 5, "nominalCost": 5, "coefficient": 1.9, "placeCost": 10, "occupant": { "playerName": "Tertiadecima", "forgePoints": 11, "membership": "outsider" } }
      ]
    },
    "remainingFp": 1285,
    "totalFp": 3485
  },
  "level": 77,
  "status": "active"
}
```

### Розрахунок

- Для перебиття першого місця потрібно щонайменше `1539 + 1 = 1540 СО`.
- Залишок `1285 СО`, тому перше місце перебити неможливо.
- Найвище вільне місце — друге, його вартість `405 × 2 = 810 СО`.
- Після внеску `810 СО` залишиться `475 СО`.
- Максимум нижнього стороннього: `11 + 475 = 486 СО`; `486 < 810`, тому друге місце гарантоване.

### Очікуваний результат і рекомендація

- Пропустити неперебивне перше місце.
- Статус для другого місця: `empty_guaranteed`.
- Новий учасник гільдії вносить `810 СО` на друге місце.
- У «Мої ВС» і «Гарантах» показувати зелену плашку «Гарантоване».

### Застосовані правила

- R-003.

## G-004 — Терміновий гарант четвертого місця

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "274084": { "playerName": "иван2000", "forgePoints": 600, "rank": 3 },
    "3389246": { "playerName": "Макс Чайка 999", "forgePoints": 1360, "rank": 1 },
    "851646354": { "playerName": "cavalo escuro", "forgePoints": 680, "rank": 2 },
    "851689153": { "playerName": "trupis19", "forgePoints": 60, "rank": 4 },
    "852152036": { "playerName": "seward", "forgePoints": 234, "rank": 3 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 600,
      "places": [
        { "placeNumber": 1, "nominalCost": 680, "coefficient": 2, "placeCost": 1360, "occupant": { "playerName": "Макс Чайка 999", "forgePoints": 1360, "membership": "guild_member" } },
        { "placeNumber": 2, "nominalCost": 340, "coefficient": 2, "placeCost": 680, "occupant": { "playerName": "cavalo escuro", "forgePoints": 680, "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 115, "coefficient": 2, "placeCost": 230, "occupant": { "playerName": "seward", "forgePoints": 234, "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 30, "coefficient": 1.95, "placeCost": 59, "occupant": { "playerName": "trupis19", "forgePoints": 60, "membership": "guild_member" } },
        { "placeNumber": 5, "nominalCost": 5, "coefficient": 1.95, "placeCost": 10 }
      ]
    },
    "remainingFp": 84,
    "totalFp": 3018
  },
  "level": 81,
  "status": "active"
}
```

### Розрахунок

- Залишок: `84 СО`.
- Внесок `trupis19`: `60 СО`.
- Мінімальний гарант власника: `84 − 60 = 24 СО`.
- Після внеску залишається `60 СО`; рівність із внеском `trupis19` не є перебиттям.

### Очікуваний результат і рекомендація

- Статус: `guild_member_can_be_overtaken`.
- Власник вносить `24 СО` для захисту четвертого місця.
- У «Мої ВС» показувати червону плашку «Терміново вкласти 24 СО».
- У «Гарантах» ВС не відображати.
- Майбутній гарант п’ятого місця не включати до поточної рекомендації.

### Застосовані правила

- R-004.

## G-005 — Доплата другого місця до повної вартості

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "244096": { "playerName": "Tertiadecima", "forgePoints": 8, "rank": 6 },
    "274084": { "playerName": "иван2000", "forgePoints": 250, "rank": 3 },
    "3389246": { "playerName": "Макс Чайка 999", "forgePoints": 50, "rank": 4 },
    "9382952": { "playerName": "Berd 222", "forgePoints": 594, "rank": 2 },
    "9773882": { "playerName": "Lexx84", "forgePoints": 200, "rank": 3 },
    "850585903": { "playerName": "Strannik888", "forgePoints": 1150, "rank": 1 },
    "852166780": { "playerName": "Тарквиний Хитрец 893", "forgePoints": 10, "rank": 5 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 250,
      "places": [
        { "placeNumber": 1, "nominalCost": 605, "coefficient": 2, "placeCost": 1210, "occupant": { "playerName": "Strannik888", "forgePoints": 1150, "membership": "outsider" } },
        { "placeNumber": 2, "nominalCost": 305, "coefficient": 2, "placeCost": 610, "occupant": { "playerName": "Berd 222", "forgePoints": 594, "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 100, "coefficient": 2, "placeCost": 200, "occupant": { "playerName": "Lexx84", "forgePoints": 200, "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 25, "coefficient": 1.9, "placeCost": 48, "occupant": { "playerName": "Макс Чайка 999", "forgePoints": 50, "membership": "guild_member" } },
        { "placeNumber": 5, "nominalCost": 5, "coefficient": 1.9, "placeCost": 10, "occupant": { "playerName": "Тарквиний Хитрец 893", "forgePoints": 10, "membership": "guild_member" } },
        { "placeNumber": 6, "occupant": { "playerName": "Tertiadecima", "forgePoints": 8, "membership": "outsider" } }
      ]
    },
    "remainingFp": 72,
    "totalFp": 2334
  },
  "level": 64,
  "status": "active"
}
```

### Розрахунок

- Вартість другого місця: `305 × 2 = 610 СО`.
- Внесок `Berd 222`: `594 СО`.
- Доплата: `610 − 594 = 16 СО`.
- Після доплати залишиться `72 − 16 = 56 СО`.

### Очікуваний результат і рекомендація

- Статус: `guild_member_below_place_cost`.
- `Berd 222` докидає `16 СО` до другого місця.
- У «Гарантах» ВС бачить лише `Berd 222` із червоною плашкою «Вартість місця 2 складає 610 СО. Треба докинути 16 СО».
- У «Мої ВС» показується помаранчева плашка «Очікуємо доплати від Berd 222».
- Нижчі місця перевіряються лише після доплати.

### Застосовані правила

- R-005.

## G-006 — Гарант власника для вільного третього місця

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "244096": { "playerName": "Tertiadecima", "forgePoints": 11, "rank": 3 },
    "274084": { "playerName": "иван2000", "forgePoints": 10000, "rank": 1 },
    "3758137": { "playerName": "Джеминист", "forgePoints": 2258, "rank": 2 },
    "850585903": { "playerName": "Strannik888", "forgePoints": 4731, "rank": 1 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 10000,
      "places": [
        { "placeNumber": 1, "nominalCost": 2490, "coefficient": 2, "placeCost": 4980, "occupant": { "playerName": "Strannik888", "forgePoints": 4731, "membership": "outsider" } },
        { "placeNumber": 2, "nominalCost": 1245, "coefficient": 2, "placeCost": 2490, "occupant": { "playerName": "Джеминист", "forgePoints": 2258, "membership": "outsider" } },
        { "placeNumber": 3, "nominalCost": 415, "coefficient": 2, "placeCost": 830 },
        { "placeNumber": 4, "nominalCost": 105, "coefficient": 1.95, "placeCost": 205 },
        { "placeNumber": 5, "nominalCost": 20, "coefficient": 1.95, "placeCost": 39 },
        { "placeNumber": 6, "occupant": { "playerName": "Tertiadecima", "forgePoints": 11, "membership": "outsider" } }
      ]
    },
    "remainingFp": 2247,
    "totalFp": 19247
  },
  "level": 130,
  "status": "active"
}
```

### Розрахунок

- Перше місце потребує `4732 СО`, друге — `2259 СО`; обидва значення перевищують залишок `2247 СО`, тому місця пропускаються.
- Найвище вільне місце — третє, вартість `415 × 2 = 830 СО`.
- Гарант власника: `11 + 2247 − 2 × 830 = 598 СО`.
- Після внеску власника залишок `1649 СО`.
- Після внеску учасника `830 СО` залишок `819 СО`; максимум Tertiadecima: `11 + 819 = 830 СО`.

### Очікуваний результат і рекомендація

- Статус: `empty_requires_owner_guarantee`.
- Власник вносить `598 СО` для підготовки третього місця.
- У «Мої ВС» показувати «Терміново вкласти 598 СО».
- У «Гарантах» ВС не відображати.
- Після внеску власника статус стає `empty_guaranteed`, а учаснику рекомендується `830 СО` на третє місце.

### Застосовані правила

- R-003.
- R-006.
