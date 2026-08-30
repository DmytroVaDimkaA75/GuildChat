# Польові кейси гаранта

Джерело: гілка `guilds/<guild>/guildUsers/<userId>/greatBuild/<gbId>` Realtime Database
проєкту `foechat-b903e`, знято 2026-08-30. Активні гільдії: `ru9_05827`, `ru11_10821`,
`ru8_22130`, `ru3_29198` (гільдії `ru3_19001` і `ru4_21858` — порожні). Базовий зріз для
розподілу нижче — `ru11_10821` (841 запис, 52 користувачі); приклади беруться з будь-якої
активної гільдії.

**Дані живі.** База перераховується у фоні: за кілька годин розподіл станів
зсувається, окремі записи змінюють статус. Числа в розділі «Розподіл станів» —
точковий зріз.

Мета документа — по одному підтвердженому прикладу на кожен `guarant.status`, який
**реально присутній** у бойових даних, із перевіркою розрахунку за
[ALGORITHM.md](ALGORITHM.md) та [RULES.md](RULES.md) і описом дії застосунку за
[STATUSES.md](STATUSES.md).

Нумерація `F-*` (field) навмисно окрема від підтверджених кейсів `G-*` у
[CASES.md](CASES.md). Кожен кейс подано з фактичним станом; поле `lastScan` виключено
за конвенцією проєкту.

## Прогрес проходу

| Кейс | Статус | Пройдено з користувачем |
|---|---|:--:|
| F-001 | `empty_requires_owner_guarantee` | ✅ інтегровано в UI |
| F-002 | `empty_guaranteed` | ✅ інтегровано в UI, баг округлення Арки виправлено |
| F-003 | `guild_member_can_be_overtaken` | ✅ інтегровано в UI (нік у плашці); пуш — окремо |
| F-004 | `no_action_required` | ✅ інтегровано в UI (плашка з номером місця) |
| F-005 | `invalid_data` | ⏸ корінь знайдено, оформлення пізніше |
| F-006 | `empty_urgent_proportional_deposit` | ✅ інтегровано в UI (recommendedDeposit) |
| F-007 | `guild_member_below_place_cost` | ⬜ (плашки в UI вже приведено до STATUSES.md) |
| F-008 | `api_error` | ⏸ корінь знайдено (спільний з F-005) |
| F-009 | `empty_owner_confirmation_required` | ⬜ |
| F-010 | `empty_urgent_deposit` | ⬜ новий статус, зʼявився у живих даних 2026-08-30 |

### Інтеграція в застосунок (2026-08-30)

Плашки F-001…F-006 приведено до цього документа + STATUSES.md:

- `i18n.js` → `guaranteeTranslations.<lang>.plashka` (6 мов) — усі рядки плашок гаранта.
- `components/GB/MyGBCenterScreen.js` `getGuaranteeBadge` — «Мої ВС»: F-001 помаранч.
  «Очікування гаранту…», F-003 черв. «Терміново вкласти N СО для прикриття `<нік>`»,
  F-004 зел. «Готова до закриття[(…місце N…)]», F-006 черв. «Перелив…» з
  `recommendedDeposit` (було `totalFp`).
- `components/GB/GBGuaranteesScreen.js` — «Гаранти»: `statusPresentation` на i18n;
  «Перелив» показує `recommendedDeposit`; коефіцієнт округлюється для показу;
  **фікс ключа Арки** `greatBuild['The Arc']` → `X_FutureEra_Landmark1` (той самий фікс
  у `GBCenterScreen.js`) — раніше фільтр Арки ховав усі гарантовані ВС із
  `requiredArcLevel > 0`.
- `functions/arcLevels.js` + `functions/gbGuarantee.js` — округлення `placeCost` вгору
  на ≤0.5 СО більше не завищує `requiredArcLevel`/`coefficient` (баг F-002 / відкрите
  питання 1а). Регресійні тести в `gbGuarantee.test.js`. **Потрібен деплой функцій.**

## Глосарій ключових полів

| Поле | Значення |
|---|---|
| `level` | Поточний рівень ВС. Розрахунок бере ігрові дані **наступного** рівня (`level + 1`). |
| `totalFp` | Повна вартість прокачки поточного рівня = `total_fp` наступного рівня з ігрового довідника (foe-helper `LegendaryBuilding`). |
| `remainingFp` | Скільки СО ще **не вкладено** — залишок до закриття рівня. Доки ніхто не вкладався, `remainingFp == totalFp`. Саме цей вільний залишок може бути використаний будь-ким для перебиття. |
| `nominalCost` | Номінальна нагорода місця у СО = `patron_bonus[rank].forgepoints` наступного рівня з ігрового довідника. База для розрахунку рівня Арки. |
| `coefficient` (у `developerDebug.places[]`) | Коефіцієнт гарант-гілки гільдії: `1.9` або `2` (`guarant.branchName` = `×1.9` / `×2`). |
| `placeCost` | Внесок для зайняття місця = `round(nominalCost × coefficient гілки)`, округлення половини вгору. Напр. `round(405 × 1.9) = round(769.5) = 770`. |
| `ownerGuaranteeFp` | Розрахований внесок власника для гаранту (дублюється в `action.amount`). |
| `coefficient` (верхній рівень `guarant`) | Для дій учасника — точний `effectiveCoefficient = recommendedDeposit / nominalCost`; для дій власника — коефіцієнт гілки. |

Джерело ігрових чисел: `greatBuildings/<gbId>/levelBase` тримає шаблон URL
`https://api.foe-helper.com/v1/LegendaryBuilding/get?id=<gbId>&level=`; сам вузол
`greatBuildings` містить лише метадані (назва, зображення, розмір, епоха).

**Логіка перебиття (спільна для всіх кейсів):** якщо вкладник займає місце сумою `X`,
його перебиває будь-хто, хто вкладе `X + 1` або більше. Рівність сум перебиттям не є —
вкладник, що вклав раніше, зберігає вищу позицію. Гарант розраховується так, щоб після
рекомендованого внеску **доступний залишок `remainingFp` став ≤ вартості цільового
місця**, тобто жоден суперник не зможе вкласти більше за цільового вкладника.

## Розподіл станів у зрізі

| `guarant.status` | К-ть | Частка | Кейс |
|---|---:|---:|---|
| `empty_requires_owner_guarantee` | 674 | 80.1 % | F-001 |
| `empty_guaranteed` | 87 | 10.3 % | F-002 |
| `guild_member_can_be_overtaken` | 40 | 4.8 % | F-003 |
| `no_action_required` | 22 | 2.6 % | F-004 |
| `invalid_data` | 6 | 0.7 % | F-005 |
| `empty_urgent_proportional_deposit` | 6 | 0.7 % | F-006 |
| `guild_member_below_place_cost` | 3 | 0.4 % | F-007 |
| `api_error` | 2 | 0.2 % | F-008 |
| `empty_owner_confirmation_required` | 1 | 0.1 % | F-009 |

Записів із відсутнім, `null` або порожнім `guarant` — **0** (кейс G-019 у цьому зрізі
не відтворюється). `lock: true` — 433 записи, `contributors` присутні — 349,
`branchId`/`branchName` — 611.

### Статуси зі STATUSES.md, відсутні в цьому зрізі

`secured_guild_member`, `outsider_can_be_overtaken`, `outsider_cannot_be_overtaken`,
`outsider_without_guild_challenger` (база кейсу G-002), `empty_urgent_deposit`,
`empty_owner_confirmation_required` присутній лише в одному записі. Для цих станів
польового прикладу з `ru11_10821` немає.

### Поля `guarant`, не описані в ALGORITHM.md / RULES.md

`effectiveCoefficient`, `requiredContributionBoost` (по 93 записи, лише у
`empty_guaranteed` та `empty_urgent_proportional_deposit`), `placeCostShortfall`,
`requiredTopUp`, `unrecoverableShortfall` (у `guild_member_below_place_cost`),
`oneFpPlacesCount`, `ownerClosingFp`, `proportionalPool`, `weightSum`,
`sumEmptyPlaceCosts`. Значення узгоджуються з формулами правил (див. перевірки нижче),
але самі імена полів у документації правил не зафіксовані.

---

## F-001 — `empty_requires_owner_guarantee`: гарант власника для порожнього першого місця

Статус: підтверджено розрахунком за R-006. Найпоширеніший стан зрізу (80 %).

Локатор: `guildUsers/274084/greatBuild/X_ArcticFuture_Landmark2`.

### Опис ситуації

ВС «Арктична оранжерея» (гілка ×1.9), власник — **иван2000** (uid 274084). Качається
рівень 64 → 65, у грі залочена (`lock: true`).

- Повна вартість рівня — `totalFp = 4317 СО`. Ще ніхто не вкладався, тож залишок до
  закриття `remainingFp = 4317` СО (дорівнює `totalFp`).
- Усі 5 призових місць вільні, сторонніх вкладників немає.
- Власник ще нічого не вклав (`ownerDeposit: 0`).
- Вартість найвищого вільного місця — `2119 СО`: це внесок, який має зробити перший
  співгільдієць, щоб зайняти 1-ше місце.

**Уразливість.** Після внеску співгільдійця `2119 СО` залишок до закриття стане
`4317 − 2119 = 2198 СО`. Будь-хто (сторонній або власник, дозайнявши) може вкласти
будь-яку суму аж до `2198`, тобто `2120` і більше — і перебити співгільдійця. Щоб
внесок `2119 СО` був захищений, власник має спершу «зʼїсти» надлишок пулу.

### Вхідний стан

```json
{
  "guarant": {
    "action": { "actor": "owner", "amount": 79, "type": "owner_deposit" },
    "branchId": "-P-fMZddXS9f8Z2bkNXz",
    "branchName": "×1.9",
    "coefficient": 1.9,
    "developerDebug": {
      "ownerDeposit": 0,
      "places": [
        { "placeNumber": 1, "nominalCost": 1115, "coefficient": 1.9, "placeCost": 2119 },
        { "placeNumber": 2, "nominalCost": 560,  "coefficient": 1.9, "placeCost": 1064 },
        { "placeNumber": 3, "nominalCost": 185,  "coefficient": 1.9, "placeCost": 352 },
        { "placeNumber": 4, "nominalCost": 45,   "coefficient": 1.9, "placeCost": 86 },
        { "placeNumber": 5, "nominalCost": 10,   "coefficient": 1.9, "placeCost": 19 }
      ]
    },
    "nominalCost": 1115,
    "ownerGuaranteeFp": 79,
    "placeCost": 2119,
    "placeNumber": 1,
    "remainingFp": 4317,
    "requiredArcLevel": 0,
    "status": "empty_requires_owner_guarantee",
    "totalFp": 4317
  },
  "level": 64,
  "lock": true,
  "status": "active"
}
```

### Розрахунок (R-006)

- Найвище доступне місце — 1-ше, вартість `P = 2119`.
- Найближчий нижній сторонній вкладник `C = 0`.
- Залишок до закриття `R = 4317`.
- Внесок власника: `max(0, C + R − 2P) = max(0, 0 + 4317 − 4238) = 79 СО`.

**Перевірка від зворотного:** треба, щоб після внеску власника `G` і внеску
співгільдійця `2119` залишок пулу став ≤ `2119` (рівність — не перебиття):
`(4317 − G − 2119) ≤ 2119` → `G ≥ 79`. Мінімальний гарант — `79 СО`.

Збігається з `ownerGuaranteeFp = 79` та `action.amount = 79`.

### Дія застосунку (STATUSES.md → `empty_requires_owner_guarantee`)

- **«Мої ВС»**: помаранчева плашка **«Очікування гаранту. Вкладіть 79 СО для гаранту на 1-ше місце»**.
- **«Гаранти»**: ВС **не відображається** до внеску власника.
- Фільтр рівня Арки до дії власника не застосовується (`requiredArcLevel = 0`).
- Після внеску `79 СО` й нового сканування очікується `empty_guaranteed` (F-002).

### Правила

- R-006.

---

## F-002 — `empty_guaranteed`: вільне місце вже забезпечене, без гаранту власника

Статус: підтверджено розрахунком за R-003 п. 4 та R-006 п. 2.

Локатор: `guildUsers/274084/greatBuild/X_AllAge_Expedition`.

### Вхідний стан

```json
{
  "contributors": {
    "244096":    { "playerName": "Tertiadecima", "forgePoints": 11,   "rank": 2 },
    "274084":    { "playerName": "иван2000",      "forgePoints": 650,  "rank": 2 },
    "850585903": { "playerName": "Strannik888",   "forgePoints": 1539, "rank": 1 }
  },
  "guarant": {
    "action": { "actor": "guild_member", "amount": 770, "type": "guild_member_deposit" },
    "coefficient": 1.9012345679012346,
    "developerDebug": {
      "ownerDeposit": 650,
      "places": [
        { "placeNumber": 1, "nominalCost": 810, "placeCost": 1539, "occupant": { "playerName": "Strannik888", "forgePoints": 1539, "membership": "outsider" } },
        { "placeNumber": 2, "nominalCost": 405, "placeCost": 770 },
        { "placeNumber": 3, "nominalCost": 135, "placeCost": 257 },
        { "placeNumber": 4, "nominalCost": 35,  "placeCost": 67 },
        { "placeNumber": 5, "nominalCost": 5,   "placeCost": 10,  "occupant": { "playerName": "Tertiadecima", "forgePoints": 11, "membership": "outsider" } }
      ]
    },
    "effectiveCoefficient": 1.9012345679012346,
    "nearestOutsider": { "playerName": "Tertiadecima", "forgePoints": 11, "membership": "outsider" },
    "nominalCost": 405,
    "ownerGuaranteeFp": 0,
    "placeCost": 770,
    "placeNumber": 2,
    "remainingFp": 1285,
    "requiredArcLevel": 82,
    "requiredContributionBoost": 90.2,
    "status": "empty_guaranteed",
    "totalFp": 3485
  },
  "level": 77,
  "lock": false,
  "status": "active"
}
```

### Розрахунок

1. **Пропуск 1-го місця (R-003).** Сторонній Strannik888: `O = 1539`. Новий учасник
   гільдії має залишок `R = 1285`; `O + 1 = 1540 > 1285` — перебити неможливо. Місце
   пропускається.
2. **Найвище вільне місце — 2-ге**, вартість `P = 770`.
3. **Гарант власника (R-006).** Найближчий нижній сторонній — Tertiadecima на 5-му
   місці, `C = 11`. `max(0, 11 + 1285 − 2 × 770) = max(0, −244) = 0`.
4. Гарант власника не потрібен → `empty_guaranteed`, рекомендований внесок дорівнює
   повній вартості місця `770` (`action.amount = 770`).
5. **Рівень Арки — у даних є дефект.** Реалізація рахує
   `effectiveCoefficient = recommendedDeposit / nominalCost = 770 / 405 = 1.90123…`
   і шукає рівень Арки під цей коефіцієнт → `requiredContributionBoost = 90.2`,
   `requiredArcLevel = 82`.

   Але `770` — це просто `round(405 × 1.9) = round(769.5)`, тобто округлення додало
   `0.5 СО`. Реальний коефіцієнт внеску — `×1.9` (коефіцієнт гілки), що відповідає
   бонусу вкладу `+90 %` і **Арці 80**. Значення `82` штучно завищене артефактом
   округлення `placeCost`.

   **Очікуване:** якщо рекомендований внесок дорівнює звичайному округленому
   `placeCost` (без роздуття за R-001/R-002), рівень Арки визначається за
   коефіцієнтом гілки. Перерахунок `effectiveCoefficient` доречний лише коли внесок
   справді перевищує `placeCost`.

   **Масштаб:** у зрізі **46 із 93** записів `empty_guaranteed` /
   `empty_urgent_proportional_deposit` мають `effectiveCoefficient` вище коефіцієнта
   гілки лише через `round()`; у всіх `requiredArcLevel` = 81–82 замість 80.

### Дія застосунку (STATUSES.md → `empty_guaranteed`)

- **«Мої ВС»**: зелена плашка **«Гарантоване»**.
- **«Гаранти»**: ВС відображається; та сама зелена плашка **«Гарантоване»**, ціль —
  2-ге місце, внесок `770 СО`.
- У «Гарантах» рекомендацію мають бачити користувачі з рівнем Арки **≥ 80** (за
  коефіцієнтом гілки `×1.9`). Через дефект вище дані вимагають `≥ 82` — Арка 80–81
  помилково відсіюється.
- Коефіцієнт для відображення — `×1,9` (коефіцієнт гілки).

### Правила

- R-003, R-006, R-009 (із застереженням щодо округлення — див. п. 5 і «Відкриті питання»).

---

## F-003 — `guild_member_can_be_overtaken`: гарант власника для групи проблемних співгільдійців

Статус: підтверджено розрахунком за R-004.

Локатор: `guildUsers/274084/greatBuild/X_ProgressiveEra_Landmark1`.

### Вхідний стан

```json
{
  "contributors": {
    "274084":    { "playerName": "иван2000",       "forgePoints": 192,  "rank": 4 },
    "4491274":   { "playerName": "Yureс",          "forgePoints": 1360, "rank": 2 },
    "849088475": { "playerName": "3arian",         "forgePoints": 2710, "rank": 1 },
    "851646354": { "playerName": "cavalo escuro",  "forgePoints": 450,  "rank": 3 }
  },
  "guarant": {
    "action": { "actor": "owner", "amount": 1952, "type": "owner_deposit" },
    "developerDebug": {
      "ownerDeposit": 192,
      "places": [
        { "placeNumber": 1, "nominalCost": 1355, "placeCost": 2575, "occupant": { "playerName": "3arian",        "forgePoints": 2710, "membership": "guild_member" } },
        { "placeNumber": 2, "nominalCost": 680,  "placeCost": 1292, "occupant": { "playerName": "Yureс",         "forgePoints": 1360, "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 225,  "placeCost": 428,  "occupant": { "playerName": "cavalo escuro", "forgePoints": 450,  "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 55,   "placeCost": 105 },
        { "placeNumber": 5, "nominalCost": 10,   "placeCost": 19 }
      ]
    },
    "occupant": { "playerName": "cavalo escuro", "forgePoints": 450, "membership": "guild_member" },
    "ownerGuaranteeFp": 1952,
    "placeNumber": 3,
    "remainingFp": 2402,
    "status": "guild_member_can_be_overtaken",
    "totalFp": 7114
  },
  "level": 96,
  "lock": false,
  "status": "active"
}
```

### Розрахунок (R-004, ALGORITHM «Вкладник гільдії, якого можна обійти»)

- Залишок `R = 2402`.
- Місце 1 (3arian, `M₁ = 2710`): `R < 2710` — обійти не можна, безпечне. Група
  проблемних починається нижче.
- Місце 2 (Yureс, `1360`): `R = 2402 > 1360` — можна обійти.
- Місце 3 (cavalo escuro, `450`): `R = 2402 > 450` — можна обійти. Безперервна група
  проблемних співгільдійців — місця 2–3.
- Ціль — **останній** проблемний вкладник групи: місце 3, `M = 450`.
- Найближчий сторонній конкурент `C = 0`.
- Внесок власника: `max(0, C + R − M) = max(0, 0 + 2402 − 450) = 1952`.

Збігається з `ownerGuaranteeFp = 1952` та `action.amount = 1952`. Один внесок захищає
всю групу (місця 2 і 3). Вільне 4-те місце в цей внесок не входить (R-004 п. 6).
Поле `coefficient` у цьому стані відсутнє в усіх 40 записах зрізу.

### Дія застосунку (STATUSES.md → `guild_member_can_be_overtaken`)

- **«Мої ВС»**: червона плашка **«Терміново вкласти 1952 СО»**.
- **«Гаранти»**: ВС **не відображається**.
- Рекомендація стосується лише першого проблемного місця/групи; наступне вільне
  місце — після нового сканування.
- Власник, вклавши `1952`, підіймає свій вклад до `192 + 1952 = 2144` — вище за
  Yureс і cavalo escuro. За конвенцією гільдії власник призового місця не займає
  (ALGORITHM: «відокремити власника від кандидатів на гарантовані місця»); ці СО —
  гарант, а не претензія на місце. Підтверджено користувачем.

### Пропозиція UI (не реалізовано)

Плашку в «Мої ВС» деталізувати: **«Терміново вкласти 1952 СО для прикриття
cavalo escuro»**, де ім'я береться з `guarant.occupant.playerName` (вкладник на
цільовому місці). Так власник одразу бачить, кого саме захищає внесок.

> **Примітка: Пуш власнику.** Повернутися після повного проходу кейсів — опрацювати
> надсилання push-сповіщення власнику для цього стану (терміновість, кого прикриваємо,
> сума). Див. розділ «Повернутися після повного проходу».

### Правила

- R-004.

---

## F-004 — `no_action_required`: після повного обходу доступної дії немає

Статус: підтверджено розрахунком за R-003 та R-007.

Локатор: `guildUsers/274084/greatBuild/X_AllAge_EasterBonus4`.

### Вхідний стан

```json
{
  "guarant": {
    "developerDebug": {
      "ownerDeposit": 50,
      "places": [
        { "placeNumber": 1, "placeCost": 1169, "occupant": { "playerName": "Макс Чайка 999", "forgePoints": 1230, "membership": "guild_member" } },
        { "placeNumber": 2, "placeCost": 589,  "occupant": { "playerName": "cavalo escuro",  "forgePoints": 620,  "membership": "guild_member" } },
        { "placeNumber": 3, "placeCost": 200,  "occupant": { "playerName": "Lymon",          "forgePoints": 210,  "membership": "outsider" } },
        { "placeNumber": 4, "placeCost": 48,   "occupant": { "playerName": "Tertiadecima",   "forgePoints": 56,   "membership": "outsider" } },
        { "placeNumber": 5, "placeCost": 10,   "occupant": { "playerName": "Джеминист",      "forgePoints": 48,   "membership": "outsider" } }
      ]
    },
    "remainingFp": 134,
    "status": "no_action_required",
    "totalFp": 2348
  },
  "level": 61,
  "lock": false,
  "status": "active"
}
```

### Розрахунок

- Залишок `R = 134`.
- Місця 1–2: співгільдійці, внески (`1230`, `620`) перевищують вартість місць
  (`1169`, `589`) — проблем немає.
- Місце 3 (сторонній Lymon, `O = 210`): `O + 1 = 211 > R = 134` — перебити неможливо
  (R-003). Пропуск.
- Місце 4 (сторонній Tertiadecima, `O = 56`): безпечний внесок
  `max(57, ceil((56 + 134) / 2)) = max(57, 95) = 95 > placeCost 48` — економічно
  недоцільно (R-007). Пропуск.
- Місце 5 (сторонній Джеминист, `O = 48`): `max(49, ceil((48 + 134) / 2)) = 91 >
  placeCost 10` (R-007). Пропуск.
- Вільних призових місць немає. Повний обхід завершено без доступної дії →
  `no_action_required`. Поле `action` відсутнє.

### Дія застосунку (STATUSES.md → `no_action_required`)

- **«Гаранти»**: ВС **не відображати**.
- **«Мої ВС»**: термінову плашку й заклик до внеску **не показувати**.
- **«Мої ВС»**: 🟢 зелена плашка **«Готова до закриття»**. Усі призові місця зайняті,
  співгільдійці в безпеці, а решта `134 СО` до закриття рівня — звичайна дія власника
  поза зоною гаранта, тож ВС вважається готовою.
- Уточнення від користувача: якщо існує **найвище місце, зайняте чужинцем, яке можна
  фізично перебити доступним залишком** (`O + 1 ≤ remainingFp`), плашку доповнити:
  **«Готова до закриття (можна перебити гравця на місці 4, але це економічно
  недоцільно)»**. У стані `no_action_required` таке місце завжди економічно недоцільне
  (інакше був би інший статус), тож перевіряти лише фізичну можливість. Тут — місце 4
  (`57 ≤ 134`); місце 3 відпадає (`211 > 134`). Якщо такого місця немає — плашка
  без дужок.

### Правила

- R-003, R-007.

---

## F-005 — `invalid_data`: вхідні дані не пройшли перевірку

Статус: у коді оголошений (STATUSES.md), бізнес-правило не підтверджене.
**Потенційний дефект** — див. примітку.

Локатор: `guildUsers/8329268/greatBuild/X_ModernEra_Landmark2`.

### Вхідний стан

```json
{
  "contributors": {
    "…": "7 вкладників, найбільший внесок 80 СО"
  },
  "guarant": {
    "calculatedAt": 1787433637054,
    "status": "invalid_data"
  },
  "level": 100,
  "status": "active"
}
```

Об'єкт `guarant` містить лише `calculatedAt` і `status`; `developerDebug`, `action`,
`placeCost` тощо відсутні.

### Спостереження

У зрізі 6 записів `invalid_data`. **5 із 6 — це та сама ВС `X_ModernEra_Landmark2`**
(рівні 4, 34, 80, 100, 102, різні гільдійці; 100 % записів цієї ВС у зрізі), ще один —
`X_StellarAgeDiscovery_Landmark1` (1 із 8 записів цієї ВС). Прив'язка до конкретного
`gbId`, а не до користувача чи рівня, вказує на дефект довідника або розрахунку саме
для `X_ModernEra_Landmark2`, а не на випадкову невалідність вводу.

### Дія застосунку (STATUSES.md → `invalid_data`)

- Типова дія: **виправити або повторно отримати дані**.
- У «Гарантах» запис не даватиме рекомендації; плашка внеску не формується.

### Рекомендація

Перевірити продюсера розрахунку (`functions/`) для `X_ModernEra_Landmark2` та
`X_ColonialAge_Landmark2` (F-008): ймовірно, бракує запису в довіднику вартостей або
рівнів Арки.

---

## F-006 — `empty_urgent_proportional_deposit`: пропорційний внесок у порожній хвіст

Статус: підтверджено розрахунком за R-001 (аналогічно G-001).

Локатор: `guilds/ru8_22130/guildUsers/853148917/greatBuild/X_OceanicFuture_Landmark3`
(знято 2026-08-30, дані живі — попередній приклад `7351048/X_SpaceAgeAsteroidBelt_Landmark1`
за кілька годин перерахувався в `empty_urgent_deposit`).

### Опис ситуації

ВС «Хвиля-руйнівник» (X_OceanicFuture_Landmark3), гілка ×1.9, власник — **Nimfirion**.
Рівень 77 → 78, `totalFp = 6219`. Власник вклав 1717 СО, більше вкладників немає, усі
5 призових місць порожні.

Щоб гарантувати всі місця за повною вартістю, треба
`2755 + 1378 + 456 + 114 + 19 = 4722 СО`, а до закриття рівня лишилось лише
`remainingFp = 4502 СО` — **на всі місця не вистачає** («перелив»). Тому СО ділять
пропорційно вазі місць, і співгільдієць вкладає свою частку в 1-ше місце.

### Вхідний стан

```json
{
  "level": 77,
  "contributors": { "853148917": { "playerName": "Nimfirion", "forgePoints": 1717, "rank": 1 } },
  "guarant": {
    "action": { "actor": "guild_member", "amount": 2627, "type": "guild_member_deposit" },
    "coefficient": 1.8117241379310345,
    "effectiveCoefficient": 1.8117241379310345,
    "developerDebug": {
      "ownerDeposit": 1717,
      "places": [
        { "placeNumber": 1, "nominalCost": 1450, "coefficient": 1.9, "placeCost": 2755 },
        { "placeNumber": 2, "nominalCost": 725,  "coefficient": 1.9, "placeCost": 1378 },
        { "placeNumber": 3, "nominalCost": 240,  "coefficient": 1.9, "placeCost": 456 },
        { "placeNumber": 4, "nominalCost": 60,   "coefficient": 1.9, "placeCost": 114 },
        { "placeNumber": 5, "nominalCost": 10,   "coefficient": 1.9, "placeCost": 19 }
      ]
    },
    "nominalCost": 1450,
    "oneFpPlacesCount": 0,
    "ownerClosingFp": 1,
    "placeCost": 2755,
    "placeNumber": 1,
    "proportionalPool": 4501,
    "recommendedDeposit": 2627,
    "remainingFp": 4502,
    "requiredArcLevel": 63,
    "requiredContributionBoost": 81.5,
    "status": "empty_urgent_proportional_deposit",
    "sumEmptyPlaceCosts": 4722,
    "totalFp": 6219,
    "weightSum": 4722
  }
}
```

### Розрахунок (R-001)

- Усі 5 місць порожні. Сума вартостей `4722` (`sumEmptyPlaceCosts`), залишок
  `R = 4502`. `4722 > 4502` → діє R-001.
- Резерв власника на закриття: `1 СО` (`ownerClosingFp`).
- Місць вартістю `1 СО` немає (`oneFpPlacesCount = 0`).
- Пропорційний пул: `4502 − 1 − 0 = 4501` (`proportionalPool`).
- Сума ваг: `4722` (`weightSum`).
- Внесок у 1-ше місце: `ceil(4501 × 2755 / 4722) = ceil(2626.06…) = 2627`
  (`recommendedDeposit`, `action.amount`).
- `effectiveCoefficient = 2627 / 1450 = 1.812` — **менший за 1.9** (справедлива частка,
  а не повна вартість місця); `1450 × (100 + 81.5) = 263 175 ≥ 262 700` →
  `requiredContributionBoost = 81.5`, `requiredArcLevel = 63`. Тут `effectiveCoefficient`
  доречний — внесок реально менший за `placeCost` (на відміну від F-002).

Усі значення збігаються.

### Дія застосунку (STATUSES.md → `empty_urgent_proportional_deposit`)

- Бізнес-стан ВС вважається **«Гарантоване»**, але для термінової рекомендації —
  червона плашка.
- **«Гаранти»**: показувати лише користувачам з Аркою ≥ 63; червона плашка
  **«Перелив. Необхідно вкласти 2627 СО»**, ціль — 1-ше місце, коефіцієнт `×1,82`
  (округлення вгору до 2 знаків).
- **«Мої ВС»**: власнику червона плашка **«Перелив. Очікуємо вкладника з
  пропорційним внеском (2627 СО)»**; окреме попередження не створюється.

### Варіант із місцем по 1 СО

`ru8_22130 / 853515192 / X_BronzeAge_Landmark2` (lvl 28): 5-те місце коштує `1 СО` →
`oneFpPlacesCount = 1`, пул = `242 − 1 − 1 = 240`, вага без 5-го місця = `647`. Внесок
у 1-ше = `ceil(240 × 371 / 647) = ceil(137.6) = 138 СО`.

### Правила

- R-001, R-009.

---

## F-007 — `guild_member_below_place_cost`: адресна доплата співгільдійця до вартості місця

Статус: підтверджено розрахунком за R-005 (аналогічно G-005).

Локатор: `guildUsers/7971087/greatBuild/X_FutureEra_Landmark1`.

### Вхідний стан

```json
{
  "guarant": {
    "action": { "actor": "guild_member", "amount": 2877, "contributorId": "3563884", "type": "guild_member_top_up" },
    "developerDebug": {
      "ownerDeposit": 4233,
      "places": [
        { "placeNumber": 1, "nominalCost": 3025, "placeCost": 5748, "occupant": { "playerName": "gude45",        "forgePoints": 6308, "membership": "outsider" } },
        { "placeNumber": 2, "nominalCost": 1515, "placeCost": 2879, "occupant": { "playerName": "Гетьман Алекс",  "forgePoints": 2,    "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 505,  "placeCost": 960 },
        { "placeNumber": 4, "nominalCost": 125,  "placeCost": 238 },
        { "placeNumber": 5, "nominalCost": 25,   "placeCost": 48 },
        { "placeNumber": 6, "occupant": { "playerName": "Выдры в гетрах", "forgePoints": 1, "membership": "outsider" } }
      ]
    },
    "occupant": { "playerName": "Гетьман Алекс", "forgePoints": 2, "membership": "guild_member" },
    "placeCost": 2879,
    "placeCostShortfall": 2877,
    "placeNumber": 2,
    "remainingFp": 23420,
    "requiredTopUp": 2877,
    "status": "guild_member_below_place_cost",
    "totalFp": 33964
  },
  "level": 153,
  "lock": false,
  "status": "active"
}
```

### Розрахунок

1. **Пропуск 1-го місця (R-002 п. 3, R-007).** Сторонній gude45: `O = 6308`,
   `R = 23420`. Безпечний внесок
   `max(O + 1, ceil((O + R) / 2)) = max(6309, 14864) = 14864 > placeCost 5748` —
   економічно недоцільно. Пропуск.
2. **Перевірка співгільдійців згори вниз (R-005 п. 7).** Місце 2 — «Гетьман Алекс»,
   фактичний внесок `2` < вартість місця `2879`.
3. Недоплата: `2879 − 2 = 2877` (`placeCostShortfall`, `requiredTopUp`).
4. `2877 ≤ remainingFp 23420` → рекомендується **повна** доплата `2877`
   (`action.amount = 2877`, `contributorId = 3563884`).
5. Нижчі місця (3–5) до фактичної доплати не обробляються (R-005 п. 6).

Усі значення збігаються.

### Дія застосунку (STATUSES.md → `guild_member_below_place_cost`, R-005)

- **«Гаранти»**: ВС показувати **лише вкладнику `3563884`**; червона плашка
  **«Вартість місця 2 складає 2879 СО. Треба докинути 2877 СО»**.
- **«Мої ВС»**: власнику помаранчева плашка **«Очікуємо доплати від Гетьман Алекс»**.
- Рекомендацій для нижчих проблемних місць до доплати не показувати.

### Правила

- R-002, R-005, R-007.

---

## F-008 — `api_error`: API повернув непридатну відповідь

Статус: у коді оголошений (STATUSES.md), бізнес-правило не підтверджене.
**Потенційний дефект** — див. примітку.

Локатор: `guildUsers/7214182/greatBuild/X_ColonialAge_Landmark2`.

### Вхідний стан

```json
{
  "guarant": {
    "calculatedAt": 1787433639462,
    "status": "api_error"
  },
  "level": 101,
  "status": "active"
}
```

### Спостереження

У зрізі рівно 2 записи `api_error`, **обидва — ВС `X_ColonialAge_Landmark2`**
(рівні 8 і 101, різні гільдійці; 100 % записів цієї ВС у зрізі). Разом із F-005
(`X_ModernEra_Landmark2`) це вказує на **систематичний збій розрахунку для конкретних
`gbId`**, а не на епізодичну помилку зовнішнього API.

### Дія застосунку (STATUSES.md → `api_error`)

- Типова дія: **повторити отримання даних / показати помилку**.
- Рекомендація внеску не формується; у «Гарантах» коректно не відображати.

### Рекомендація

Спільно з F-005 перевірити продюсера в `functions/` та довідники для
`X_ColonialAge_Landmark2` і `X_ModernEra_Landmark2`. Якщо це справді помилка зовнішнього
API — додати ретрай або деградацію, щоб стан не «застигав» на `api_error` між
скануваннями.

---

## F-009 — `empty_owner_confirmation_required`: підтвердження власника для останнього кроку

Статус: у коді оголошений (STATUSES.md, «лише реалізація»). Розрахунок узгоджений із
R-006/R-007, але сам статус і дія `confirm_with_owner` правилом не підтверджені.

Локатор: `guildUsers/6464103/greatBuild/X_StellarAgeDiscovery_Landmark1`.

### Вхідний стан

```json
{
  "guarant": {
    "action": { "actor": "owner", "amount": 1, "type": "confirm_with_owner" },
    "branchName": "×1.9",
    "coefficient": 1.9,
    "developerDebug": {
      "ownerDeposit": 7330,
      "places": [
        { "placeNumber": 1, "nominalCost": 80, "placeCost": 152, "occupant": { "playerName": "Фрея11",             "forgePoints": 160, "membership": "guild_member" } },
        { "placeNumber": 2, "nominalCost": 40, "placeCost": 76,  "occupant": { "playerName": "PASSAT B6",          "forgePoints": 80,  "membership": "guild_member" } },
        { "placeNumber": 3, "nominalCost": 15, "placeCost": 29,  "occupant": { "playerName": "Volodimir Prihodko", "forgePoints": 30,  "membership": "guild_member" } },
        { "placeNumber": 4, "nominalCost": 5,  "placeCost": 10,  "occupant": { "playerName": "саша-1974",          "forgePoints": 19,  "membership": "outsider" } },
        { "placeNumber": 5, "nominalCost": 0,  "placeCost": 1 }
      ]
    },
    "nominalCost": 0,
    "ownerClosingFp": 1,
    "placeCost": 1,
    "placeNumber": 5,
    "recommendedDeposit": 0,
    "remainingFp": 1,
    "status": "empty_owner_confirmation_required",
    "sumEmptyPlaceCosts": 1,
    "totalFp": 7620
  },
  "level": 5,
  "lock": false,
  "status": "active"
}
```

### Розрахунок

- Місця 1–3: співгільдійці, внески перевищують вартість місць — проблем немає.
- Місце 4 (сторонній «саша-1974», `O = 19`, `placeCost = 10`): безпечний внесок
  `max(20, ceil((19 + 1) / 2)) = max(20, 10) = 20 > 10` — економічно недоцільно
  (R-007). Пропуск.
- Місце 5: порожнє, `placeCost = 1`, `nominalCost = 0`. Гарант власника (R-006):
  `P = 1`, `C = 0`, `R = 1` → `max(0, 0 + 1 − 2) = 0`.
- Залишається лише `1 СО` закриття рівня (`ownerClosingFp = 1`, `remainingFp = 1`),
  що дорівнює вартості 5-го місця. Замість внеску формується запит на **підтвердження
  власника** (`action.type = confirm_with_owner`, `amount = 1`).

### Дія застосунку (STATUSES.md → `empty_owner_confirmation_required`)

- Типова дія: **підтвердження / внесок власника** для останнього кроку.
- Стан рідкісний (1 запис на 841). UI-плашка правилом не зафіксована; поводитися як з
  дією власника (не приховувати фільтром Арки), у «Гарантах» до підтвердження не
  показувати.

### Правила

- R-006, R-007 (частково); статус потребує окремого підтвердження.

---

## Зведення: стан → дія застосунку

| Статус | Хто діє | «Мої ВС» | «Гаранти» | Фільтр Арки |
|---|---|---|---|---|
| `empty_requires_owner_guarantee` | власник | помаранч. «Очікування гаранту. Вкладіть N СО…» | не показувати | ні |
| `empty_guaranteed` | учасник гільдії | зелена «Гарантоване» | показувати, зелена «Гарантоване» | так |
| `empty_urgent_proportional_deposit` | учасник гільдії | червона «Перелив. Очікуємо вкладника…» | показувати, червона «Перелив. Вкласти N СО» | так |
| `guild_member_can_be_overtaken` | власник | червона «Терміново вкласти N СО [для прикриття <нік>]» | не показувати | ні |
| `guild_member_below_place_cost` | конкретний вкладник | помаранч. «Очікуємо доплати від <ім'я>» | лише цьому вкладнику, червона плашка | ні |
| `no_action_required` | — | зелена «Готова до закриття [(можна перебити гравця на місці N, але це економічно недоцільно)]» | не показувати | — |
| `empty_owner_confirmation_required` | власник | (не зафіксовано) | не показувати до підтвердження | ні |
| `invalid_data` | система | (не показувати рекомендацію) | не показувати | — |
| `api_error` | система | (не показувати рекомендацію) | не показувати | — |

## Повернутися після повного проходу

- **F-005 / F-008 — детальне оформлення.** Корінь встановлено (див. нижче): у
  `greatBuildings/X_ModernEra_Landmark2` відсутнє `levelBase`; у
  `greatBuildings/X_ColonialAge_Landmark2` `levelBase` закінчується на `&level=10`
  замість `&level=`. Аудит усіх 49 записів `greatBuildings` — лише ці дві помилки.
  Дооформити кейси F-005/F-008 і, за потреби, завести окремий баг-звіт.
- **F-010 — `empty_urgent_deposit`.** Новий статус, помічений у живих даних 2026-08-30
  (2 записи: `ru9_05827` та `ru11_10821`). У STATUSES.md позначений «лише реалізація».
  Приклад на момент виявлення: `ru11_10821/7351048/X_SpaceAgeAsteroidBelt_Landmark1` —
  сторонній на 1-му місці, `nextEmptyPlace`, `requiredArcLevel = 80`. Скласти кейс.
- **Пуш власнику для `guild_member_can_be_overtaken` (F-003).** Опрацювати push-сповіщення
  власнику ВС: терміновість, цільове місце, нік вкладника, якого прикриваємо
  (`guarant.occupant.playerName`), сума внеску. Поточний стан надсилання пушів для
  гаранта — уточнити після проходу решти кейсів.

## Відкриті питання

1. **`X_ModernEra_Landmark2` → завжди `invalid_data`, `X_ColonialAge_Landmark2` →
   завжди `api_error`.** Схоже на дефект продюсера розрахунку в `functions/` для цих
   `gbId`. Потребує перевірки довідників вартостей/рівнів.

1а. **[ВИПРАВЛЕНО 2026-08-30] Артефакт округлення в `requiredArcLevel` (див. F-002
   п. 5).** `round(nominalCost × коеф. гілки)` при діленні назад давало коефіцієнт на
   частки більший за коефіцієнт гілки → рівень Арки завищувався на 1–2 (82 замість 80
   для `×1.9`). Фікс: `functions/arcLevels.js` `findRequiredArcLevel` приймає
   `multiplier` і при `|amount − nominal×multiplier| ≤ 0.5` рахує від
   `nominal×multiplier`; `functions/gbGuarantee.js` для «звичайного» місця
   (`action.amount === placeCost`) звітує `coefficient`/`effectiveCoefficient` за
   гілкою. Наявні записи в БД перерахуються при наступному оновленні `updateAt` (після
   деплою функцій). Лишається уточнити формулювання R-009 п. 1 / ALGORITHM.md п. 6.
2. **`empty_owner_confirmation_required`** — статус і дія `confirm_with_owner` не
   описані в RULES.md. Потрібне правило й UI-специфікація.

2а. **UI-пропозиція для `guild_member_can_be_overtaken` (F-003).** Плашку в «Мої ВС»
   деталізувати до **«Терміново вкласти N СО для прикриття <нік>»**, де нік —
   `guarant.occupant.playerName` (вкладник на цільовому місці). Погоджено з
   користувачем; вимагає правки STATUSES.md «Відображення guild_member_can_be_overtaken».

2б. **UI/дані для `no_action_required` (F-004).** Плашка «Готова до закриття» має
   опційно називати **найвище місце, зайняте чужинцем, яке можна фізично перебити
   доступним залишком** (`O + 1 ≤ remainingFp`). Зараз запис `no_action_required` не
   містить ні `action`, ні цільового місця — це поле треба або додати в розрахунок
   (напр. `guarant.economicallyUnbeatablePlace`), або обчислювати на клієнті з
   `developerDebug.places` + `remainingFp` (ризиковано: `developerDebug` службове).
   Також підтвердити: `no_action_required` завжди дає зелену «Готова до закриття»
   (навіть коли до закриття рівня бракує СО — це дія власника поза гарантом).
3. **Недокументовані поля `guarant`** (`effectiveCoefficient`,
   `requiredContributionBoost`, `placeCostShortfall`, `requiredTopUp`,
   `unrecoverableShortfall`, `oneFpPlacesCount`, `ownerClosingFp`, `proportionalPool`,
   `weightSum`, `sumEmptyPlaceCosts`) — варто внести в STATUSES.md або окремий
   словник полів.
4. **Половина статусів зі STATUSES.md** (`secured_guild_member`,
   `outsider_*`, `empty_urgent_deposit`) не має польового прикладу в `ru11_10821` —
   для повного покриття потрібен зріз інших гільдій.
