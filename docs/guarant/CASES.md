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

### Відображення

- У «Гарантах» ВС бачать користувачі з Аркою 42+.
- Червона плашка: `Перелив. Необхідно вкласти 1232 СО`.
- Показуються 1-ше місце, внесок `1232 СО` та коефіцієнт `×1,63`.
- У «Мої ВС» власник бачить червону плашку: `Перелив. Очікуємо вкладника з пропорційним внеском (1232 СО)`.
- Окреме попередження власнику не створюється; стан ВС називається гарантованим.

### Застосовані правила

- R-001.
- R-009.

## G-002 — Кінцевий внесок для перебиття стороннього на четвертому місці

Статус: переглянуто. Початкова рекомендація `95 СО` скасована пізнішим явним рішенням про економічну межу перебиття.

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

- Вартість четвертого місця становить `48 СО`, а безпечний внесок — `95 СО`.
- Оскільки `95 > 48`, перебиття економічно недоцільне й не рекомендується.
- Дозвіл власника на перебиття не запитувати.
- Не показувати новому вкладнику пропозицію внести `95 СО`; стороннє місце пропустити.
- Оскільки в початковому JSON п'яте місце також зайняте, доступних дій більше немає: у «Гарантах» ВС не показувати, а в «Мої ВС» показати зелену плашку `Готова до закриття`.

### Уточнений варіант: порожнє п'яте місце

- Це окремий стан, а не тотожний вхідному JSON G-002.
- Економічно недоступне четверте місце пропускається, після чого алгоритм перевіряє порожнє п'яте місце вартістю `10 СО`.
- Гарант власника: `134 − 2 × 10 = 114 СО`.
- До внеску власника ВС не показується у «Гарантах»; у «Мої ВС» показується помаранчева плашка `Очікування гаранту. Вкладіть 114 СО для гаранту на 5-те місце`.
- Після внеску власника залишається `20 СО`; після нового сканування п'яте місце гарантоване для внеску `10 СО`.
- Тоді ВС показується в «Гарантах», а в «Мої ВС» має зелену плашку `Гарантоване`.

### Застосовані правила

- R-002.
- R-007, яке має пріоритет над початковою рекомендацією цього кейсу.
- R-006 для уточненого варіанта з порожнім п'ятим місцем.

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

## G-007 — Захист четвертого місця внеском власника 63 СО

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "274084": { "playerName": "иван2000", "forgePoints": 3000, "rank": 1 },
    "3389246": { "playerName": "Макс Чайка 999", "forgePoints": 2520, "rank": 1 },
    "851646354": { "playerName": "cavalo escuro", "forgePoints": 1260, "rank": 2 },
    "851689153": { "playerName": "trupis19", "forgePoints": 110, "rank": 4 },
    "852152036": { "playerName": "seward", "forgePoints": 429, "rank": 3 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 3000,
      "places": [
        { "placeNumber": 1, "nominalCost": 1260, "coefficient": 2, "placeCost": 2520, "occupant": { "playerName": "Макс Чайка 999", "forgePoints": 2520, "membership": "guild_member" } },
        { "placeNumber": 2, "nominalCost": 630, "coefficient": 2, "placeCost": 1260, "occupant": { "playerName": "cavalo escuro", "forgePoints": 1260, "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 210, "coefficient": 2, "placeCost": 420, "occupant": { "playerName": "seward", "forgePoints": 429, "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 55, "coefficient": 1.95, "placeCost": 107, "occupant": { "playerName": "trupis19", "forgePoints": 110, "membership": "guild_member" } },
        { "placeNumber": 5, "nominalCost": 10, "coefficient": 1.95, "placeCost": 20 }
      ]
    },
    "remainingFp": 173,
    "totalFp": 7492
  },
  "level": 105,
  "status": "active"
}
```

### Розрахунок

- Вартість четвертого місця: `55 × 1.95 = 107.25`, округлено до `107 СО`.
- Внесок `trupis19`: `110 СО`; недоплати до вартості місця немає.
- Залишок: `173 СО`; сторонніх вкладників немає, тому `C = 0`.
- Гарант власника: `0 + 173 − 110 = 63 СО`.
- Після внеску власника залишок `110 СО`, що дорівнює внеску `trupis19`; рівність не є перебиттям.

### Очікуваний результат і рекомендація

- Статус: `guild_member_can_be_overtaken`.
- Власник вносить `63 СО` для захисту четвертого місця.
- У «Мої ВС» показувати червону плашку «Терміново вкласти 63 СО».
- У «Гарантах» ВС не відображати.
- Майбутній гарант п’ятого місця не включати до поточної рекомендації.

### Застосовані правила

- R-004.

## G-008 — Гарантоване перше місце при повністю порожньому розподілі

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "274084": { "playerName": "иван2000", "forgePoints": 183, "rank": 1 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 183,
      "places": [
        { "placeNumber": 1, "nominalCost": 950, "coefficient": 2, "placeCost": 1900 },
        { "placeNumber": 2, "nominalCost": 475, "coefficient": 2, "placeCost": 950 },
        { "placeNumber": 3, "nominalCost": 160, "coefficient": 2, "placeCost": 320 },
        { "placeNumber": 4, "nominalCost": 40, "coefficient": 1.9, "placeCost": 76 },
        { "placeNumber": 5, "nominalCost": 10, "coefficient": 1.9, "placeCost": 19 }
      ]
    },
    "ownerGuaranteeFp": 0,
    "placeNumber": 1,
    "remainingFp": 3341,
    "status": "empty_guaranteed",
    "totalFp": 3524
  },
  "level": 54,
  "status": "active"
}
```

### Розрахунок

- Сума вартостей місць: `1900 + 950 + 320 + 76 + 19 = 3265 СО`.
- Залишок `3341 СО` більший за суму, тому пропорційний режим R-001 не застосовується.
- Гарант власника для першого місця: `max(0, 3341 − 2 × 1900) = 0 СО`.
- Після внеску `1900 СО` залишок `1441 СО`; `1441 < 1900`, тому перше місце захищене.

### Очікуваний результат і рекомендація

- Статус: `empty_guaranteed`.
- Новий учасник гільдії вносить `1900 СО` на перше місце.
- Внесок власника не потрібен.
- У «Мої ВС» та «Гарантах» показувати зелену плашку «Гарантоване».
- Після внеску перше місце гарантоване; наступна окрема рекомендація — `950 СО` на друге місце.

### Застосовані правила

- Підтверджена логіка `empty_guaranteed`.

## G-009 — Один гарант для двох проблемних вкладників поспіль

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "274084": { "playerName": "иван2000", "forgePoints": 192, "rank": 4 },
    "4491274": { "playerName": "Yureс", "forgePoints": 1360, "rank": 2 },
    "849088475": { "playerName": "3arian", "forgePoints": 2710, "rank": 1 },
    "851646354": { "playerName": "cavalo escuro", "forgePoints": 450, "rank": 3 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 192,
      "places": [
        { "placeNumber": 1, "nominalCost": 1355, "coefficient": 2, "placeCost": 2710, "occupant": { "playerName": "3arian", "forgePoints": 2710, "membership": "guild_member" } },
        { "placeNumber": 2, "nominalCost": 680, "coefficient": 2, "placeCost": 1360, "occupant": { "playerName": "Yureс", "forgePoints": 1360, "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 225, "coefficient": 2, "placeCost": 450, "occupant": { "playerName": "cavalo escuro", "forgePoints": 450, "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 55, "coefficient": 1.95, "placeCost": 107 },
        { "placeNumber": 5, "nominalCost": 10, "coefficient": 1.95, "placeCost": 20 }
      ]
    },
    "remainingFp": 2402,
    "totalFp": 7114
  },
  "level": 96,
  "status": "active"
}
```

### Розрахунок

- Перше місце захищене: `2710 > 2402`.
- Друге та третє місця утворюють безперервну групу проблемних вкладників.
- Останній вкладник групи — `cavalo escuro` на третьому місці з `450 СО`.
- Гарант власника: `2402 − 450 = 1952 СО`.
- Після внеску залишок `450 СО`: друге місце має `1360 > 450`, третє — `450 = 450`.

### Очікуваний результат і рекомендація

- Статус: `guild_member_can_be_overtaken`.
- Цільове місце: 3.
- Власник вносить `1952 СО`, одночасно захищаючи друге й третє місця.
- У «Мої ВС» показувати червону плашку «Терміново вкласти 1952 СО».
- У «Гарантах» ВС не відображати.
- Вільне четверте місце перевіряється лише після нового сканування.

### Застосовані правила

- R-004.

## G-010 — Один гарант для проблемних місць 2–5

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "274084": { "playerName": "иван2000", "forgePoints": 13023, "rank": 1 },
    "3389246": { "playerName": "Макс Чайка 999", "forgePoints": 5000, "rank": 1 },
    "4888454": { "playerName": "miheliys", "forgePoints": 740, "rank": 3 },
    "5569010": { "playerName": "Yaroslav Lion 1", "forgePoints": 2220, "rank": 2 },
    "7214182": { "playerName": "ВiтькаКучерявий", "forgePoints": 190, "rank": 4 },
    "9773882": { "playerName": "Lexx84", "forgePoints": 40, "rank": 5 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 13023,
      "places": [
        { "placeNumber": 1, "nominalCost": 2220, "coefficient": 2, "placeCost": 4440, "occupant": { "playerName": "Макс Чайка 999", "forgePoints": 5000, "membership": "guild_member" } },
        { "placeNumber": 2, "nominalCost": 1110, "coefficient": 2, "placeCost": 2220, "occupant": { "playerName": "Yaroslav Lion 1", "forgePoints": 2220, "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 370, "coefficient": 2, "placeCost": 740, "occupant": { "playerName": "miheliys", "forgePoints": 740, "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 95, "coefficient": 1.95, "placeCost": 185, "occupant": { "playerName": "ВiтькаКучерявий", "forgePoints": 190, "membership": "guild_member" } },
        { "placeNumber": 5, "nominalCost": 20, "coefficient": 1.95, "placeCost": 39, "occupant": { "playerName": "Lexx84", "forgePoints": 40, "membership": "guild_member" } }
      ]
    },
    "remainingFp": 2639,
    "totalFp": 23852
  },
  "level": 145,
  "status": "active"
}
```

### Розрахунок

- Перше місце захищене: `5000 > 2639`.
- Місця 2–5 утворюють безперервну групу проблемних вкладників.
- Останній вкладник групи — `Lexx84` на п’ятому місці з `40 СО`.
- Гарант власника: `2639 − 40 = 2599 СО`.
- Після внеску залишок `40 СО`; усі місця 2–5 захищені, п’яте — рівністю `40 = 40`.

### Очікуваний результат і рекомендація

- Статус: `guild_member_can_be_overtaken`.
- Цільове місце: 5.
- Власник вносить `2599 СО`, одночасно захищаючи місця 2–5.
- У «Мої ВС» показувати червону плашку «Терміново вкласти 2599 СО».
- У «Гарантах» ВС не відображати.
- Після внеску очікується `no_action_required`, якщо стан не зміниться.

### Застосовані правила

- R-004.

## G-011 — Неперебивне перше місце та гарантоване друге за 900 СО

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "244096": { "playerName": "Tertiadecima", "forgePoints": 40, "rank": 2 },
    "274084": { "playerName": "иван2000", "forgePoints": 200, "rank": 2 },
    "850585903": { "playerName": "Strannik888", "forgePoints": 1710, "rank": 1 },
    "853291202": { "playerName": "Дед Мороz", "forgePoints": 20, "rank": 3 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 200,
      "places": [
        { "placeNumber": 1, "nominalCost": 900, "coefficient": 2, "placeCost": 1800, "occupant": { "playerName": "Strannik888", "forgePoints": 1710, "membership": "outsider" } },
        { "placeNumber": 2, "nominalCost": 450, "coefficient": 2, "placeCost": 900 },
        { "placeNumber": 3, "nominalCost": 150, "coefficient": 2, "placeCost": 300 },
        { "placeNumber": 4, "nominalCost": 40, "coefficient": 1.9, "placeCost": 76 },
        { "placeNumber": 5, "nominalCost": 10, "coefficient": 1.9, "placeCost": 19, "occupant": { "playerName": "Tertiadecima", "forgePoints": 40, "membership": "outsider" } },
        { "placeNumber": 6, "occupant": { "playerName": "Дед Мороz", "forgePoints": 20, "membership": "outsider" } }
      ]
    },
    "remainingFp": 1361,
    "totalFp": 3331
  },
  "level": 50,
  "status": "active"
}
```

### Розрахунок

- Для перебиття першого місця потрібно `1711 СО`, що перевищує залишок `1361 СО`.
- Найвище вільне місце — друге, його вартість `450 × 2 = 900 СО`.
- Гарант власника: `max(0, 40 + 1361 − 2 × 900) = 0 СО`.
- Після внеску `900 СО` залишок `461 СО`; максимум Tertiadecima: `40 + 461 = 501 СО`.
- `501 < 900`, тому друге місце гарантоване.

### Очікуваний результат і рекомендація

- Пропустити неперебивне перше місце.
- Статус: `empty_guaranteed`.
- Новий учасник гільдії вносить `900 СО` на друге місце.
- У «Мої ВС» та «Гарантах» показувати зелену плашку «Гарантоване».
- Після внеску наступна окрема рекомендація — `300 СО` на третє місце.

### Застосовані правила

- R-003.
- Підтверджена логіка `empty_guaranteed`.

## G-012 — Гарант власника для першого місця з нижнім стороннім вкладником

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "1120118": { "playerName": "Finiva UA", "forgePoints": 45, "rank": 2 },
    "853324027": { "playerName": "Fisherman2025", "forgePoints": 86, "rank": 1 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 45,
      "places": [
        { "placeNumber": 1, "nominalCost": 1120, "coefficient": 2, "placeCost": 2240 },
        { "placeNumber": 2, "nominalCost": 560, "coefficient": 2, "placeCost": 1120 },
        { "placeNumber": 3, "nominalCost": 185, "coefficient": 2, "placeCost": 370 },
        { "placeNumber": 4, "nominalCost": 45, "coefficient": 1.95, "placeCost": 88 },
        { "placeNumber": 5, "nominalCost": 10, "coefficient": 1.95, "placeCost": 20, "occupant": { "playerName": "Fisherman2025", "forgePoints": 86, "membership": "outsider" } }
      ]
    },
    "remainingFp": 6172,
    "totalFp": 6303
  },
  "level": 101,
  "status": "active"
}
```

### Розрахунок

- Перше місце порожнє, його вартість `1120 × 2 = 2240 СО`.
- Найближчий нижній сторонній вкладник має `86 СО`.
- Гарант власника: `86 + 6172 − 2 × 2240 = 1778 СО`.
- Після внеску власника залишок `4394 СО`.
- Після внеску учасника `2240 СО` залишок `2154 СО`; максимум Fisherman2025: `86 + 2154 = 2240 СО`.

### Очікуваний результат і рекомендація

- Початковий статус: `empty_requires_owner_guarantee`.
- Власник `Finiva UA` вносить `1778 СО`.
- У «Мої ВС» показувати «Терміново вкласти 1778 СО», у «Гарантах» ВС не відображати.
- Після внеску власника статус стає `empty_guaranteed`.
- Учасник гільдії вносить `2240 СО` на перше місце; рівність із максимумом стороннього не є перебиттям.

### Застосовані правила

- R-006.

## G-013 — Гарант власника для першого місця без сторонніх вкладників

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "1120118": { "playerName": "Finiva UA", "forgePoints": 2, "rank": 1 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 2,
      "places": [
        { "placeNumber": 1, "nominalCost": 1120, "coefficient": 2, "placeCost": 2240 },
        { "placeNumber": 2, "nominalCost": 560, "coefficient": 2, "placeCost": 1120 },
        { "placeNumber": 3, "nominalCost": 185, "coefficient": 2, "placeCost": 370 },
        { "placeNumber": 4, "nominalCost": 45, "coefficient": 1.95, "placeCost": 88 },
        { "placeNumber": 5, "nominalCost": 10, "coefficient": 1.95, "placeCost": 20 }
      ]
    },
    "remainingFp": 6301,
    "totalFp": 6303
  },
  "level": 101,
  "status": "active"
}
```

### Розрахунок

- Перше місце порожнє, його вартість `1120 × 2 = 2240 СО`.
- Сторонніх вкладників немає, тому `C = 0`.
- Гарант власника: `0 + 6301 − 2 × 2240 = 1821 СО`.
- Після внеску власника його загальний внесок становить `1823 СО`, залишок — `4480 СО`.
- Після внеску учасника гільдії `2240 СО` залишок становить `2240 СО`: потенційний конкурент може лише зрівнятися з ним.

### Очікуваний результат і рекомендація

- Початковий статус: `empty_requires_owner_guarantee`.
- Власник `Finiva UA` докидає `1821 СО`.
- У «Мої ВС» показувати «Терміново вкласти 1821 СО», у «Гарантах» ВС не відображати.
- Після внеску власника статус стає `empty_guaranteed`.
- Учасник гільдії вносить `2240 СО` на перше місце.
- Після цього друге місце вартістю `1120 СО` є наступним гарантованим місцем.

### Застосовані правила

- R-006.

## G-014 — Великий гарант власника для першого порожнього місця

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "1120118": { "playerName": "Finiva UA", "forgePoints": 12476, "rank": 1 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 12476,
      "places": [
        { "placeNumber": 1, "nominalCost": 3280, "coefficient": 2, "placeCost": 6560 },
        { "placeNumber": 2, "nominalCost": 1640, "coefficient": 2, "placeCost": 3280 },
        { "placeNumber": 3, "nominalCost": 545, "coefficient": 2, "placeCost": 1090 },
        { "placeNumber": 4, "nominalCost": 135, "coefficient": 1.95, "placeCost": 263 },
        { "placeNumber": 5, "nominalCost": 25, "coefficient": 1.95, "placeCost": 49 }
      ]
    },
    "remainingFp": 31497,
    "totalFp": 43973
  },
  "level": 158,
  "status": "active"
}
```

### Розрахунок

- Вартість першого місця: `3280 × 2 = 6560 СО`.
- Сторонніх вкладників немає, тому `C = 0`.
- Гарант власника: `0 + 31497 − 2 × 6560 = 18377 СО`.
- Після внеску власника його загальний внесок становить `30853 СО`, залишок — `13120 СО`.
- Після внеску учасника гільдії `6560 СО` залишок становить `6560 СО`; потенційний конкурент може лише зрівнятися з ним.

### Очікуваний результат і рекомендація

- Початковий статус: `empty_requires_owner_guarantee`.
- Власник `Finiva UA` докидає `18377 СО`.
- У «Мої ВС» показувати «Терміново вкласти 18377 СО», у «Гарантах» ВС не відображати.
- Після внеску власника статус стає `empty_guaranteed`.
- Учасник гільдії вносить `6560 СО` на перше місце.
- Наступною ціллю стає гарантоване друге місце вартістю `3280 СО`.

### Застосовані правила

- R-006.

## G-015 — Пропуск дорогих сторонніх місць і захист співгільдійця нижче

Статус: підтверджено.

### Вхідний JSON

```json
{
  "contributors": {
    "9297503": { "playerName": "vovnov", "forgePoints": 330 },
    "8218997": { "playerName": "itsmespd16", "forgePoints": 34628 },
    "849592100": { "playerName": "Wasso86", "forgePoints": 11709 },
    "3563884": { "playerName": "Гетьман Алекс", "forgePoints": 1340 },
    "7433108": { "playerName": "Мелдар", "forgePoints": 52 },
    "850765254": { "playerName": "janka13", "forgePoints": 51 },
    "853159519": { "playerName": "izik", "forgePoints": 50 }
  },
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 330,
      "places": [
        { "placeNumber": 1, "placeCost": 7340, "occupant": { "playerName": "itsmespd16", "forgePoints": 34628, "membership": "outsider" } },
        { "placeNumber": 2, "placeCost": 3670, "occupant": { "playerName": "Wasso86", "forgePoints": 11709, "membership": "outsider" } },
        { "placeNumber": 3, "placeCost": 1220, "occupant": { "playerName": "Гетьман Алекс", "forgePoints": 1340, "membership": "guild_member" } },
        { "placeNumber": 4, "placeCost": 302 },
        { "placeNumber": 5, "placeCost": 59 },
        { "placeNumber": 6, "occupant": { "playerName": "Мелдар", "forgePoints": 52, "membership": "outsider" } },
        { "placeNumber": 7, "occupant": { "playerName": "janka13", "forgePoints": 51, "membership": "outsider" } },
        { "placeNumber": 8, "occupant": { "playerName": "izik", "forgePoints": 50, "membership": "outsider" } }
      ]
    },
    "remainingFp": 17994,
    "totalFp": 66154
  },
  "level": 180
}
```

### Розрахунок

- Перше стороннє місце неперебивне: потрібно щонайменше `34629 СО`, що більше за залишок.
- Безпечне перебиття другого місця коштує більше за його вартість `3670 СО`, тому місце пропускається за R-007.
- Найближчий нижній сторонній конкурент для Гетьмана Алекса має `52 СО`.
- Гарант власника: `52 + 17994 − 1340 = 16706 СО`.
- Після внеску власника залишок становить `1288 СО`; максимум конкурента — `52 + 1288 = 1340 СО`.

### Очікуваний результат і рекомендація

- Не рекомендувати перебиття першого або другого місця.
- Статус: `guild_member_can_be_overtaken`.
- Власник `vovnov` докидає `16706 СО` для захисту Гетьмана Алекса на третьому місці.
- У «Мої ВС» показувати «Терміново вкласти 16706 СО»; у «Гарантах» ВС не відображати.
- Порожнє четверте місце перевіряється окремо після нового сканування.

### Застосовані правила

- R-007.
- R-004.

## G-016 — Максимально можлива доплата із резервом 1 СО власнику

Статус: підтверджено.

### Вхідний стан

- Власник: `Lexx84`, внесок `20690 СО`.
- Залишок: `371 СО`.
- Місця і внески: `vovnov — 4070/4070`, `Volodimir Prihodko — 1043/2040`, `AlexRomanika — 680/680`, `Yureс — 170/166`, `OleksiiSheff — 30/29`.

### Очікуваний результат і рекомендація

- Не створювати штучне порожнє друге місце; зберегти фактичні місця за рейтингом.
- Статус: `guild_member_below_place_cost` для Volodimir Prihodko на другому місці.
- Повна недоплата: `2040 − 1043 = 997 СО`.
- Рекомендувати максимально можливі `371 − 1 = 370 СО`.
- Після внеску Volodimir Prihodko матиме `1413 СО`, невідновна недоплата — `627 СО`, власнику залишається `1 СО` для закриття.

### Застосовані правила

- R-005.

## G-017 — Кілька недоплат із суворим пріоритетом згори вниз

Статус: підтверджено.

### Вхідний стан

- Власник: `Газорпазорпфилд`, залишок `1196 СО`.
- Місця і внески: `Тарквиний Хитрец 893 — 3316/3490`, `VESTA08 — 580/1750`, `cavalo escuro — 551/580`, `PASSAT B6 — 143/146`, `Yaroslav Lion 1 — 30/29`.

### Очікуваний результат і рекомендація

1. Не створювати штучне порожнє друге місце; зберегти фактичний рейтинг.
2. Спочатку Тарквиний Хитрец 893 повністю докидає `174 СО`; залишок стає `1022 СО`.
3. Після нового сканування VESTA08 докидає максимально можливі `1021 СО`; власнику залишається `1 СО`.
4. Невідновна недоплата VESTA08 становить `149 СО`; нижчі недоплати не обробляються раніше за неї.
5. Власник закриває рівень останнім `1 СО`.

### Застосовані правила

- R-005.

## G-018 — Після пропуску сторонніх місць доступної дії немає

Статус: підтверджено як груповий кейс пакетного аналізу `11.json`.

### Варіанти вхідного стану

1. Стороннього вкладника неможливо або економічно недоцільно перебити, а всі призові місця вже зайняті.
2. Після пропуску стороннього вкладника є вільне місце, але його повна вартість перевищує доступний залишок; нижче також немає іншої підтвердженої дії.

У `11.json` підтверджено 10 таких ВС, зокрема повністю зайняті споруди та споруди з вільними місцями `260/248`, `150/107`, `160/36` і `48/26` (`вартість/залишок`).

### Очікуваний результат і рекомендація

- Не рекомендувати неможливий або дорожчий за місце внесок.
- Пропустити недоступні сторонні та порожні місця й завершити повний обхід.
- Статус: `no_action_required`.
- У «Гарантах» ВС не відображати; у «Мої ВС» не показувати термінову плашку.

### Застосовані правила

- R-003.
- R-007.

## G-019 — Відсутній або порожній розрахунок гаранта

Статус: підтверджено як груповий кейс пакетного аналізу `11.json`.

### Вхідний стан

Поле `guarant` відсутнє, дорівнює `null` або є порожнім об’єктом `{}`. У `11.json` було 7 таких записів: 2 × `X_ColonialAge_Landmark2` і 5 × `X_ModernEra_Landmark2`.

### Очікуваний результат і рекомендація

- Повністю пропустити запис без бізнес-аналізу.
- Не формувати статус або рекомендацію внеску.
- Не показувати запис у «Гарантах».
- Не класифікувати його як неоднозначний кейс до появи непорожнього `guarant`.

### Застосовані правила

- R-008.
