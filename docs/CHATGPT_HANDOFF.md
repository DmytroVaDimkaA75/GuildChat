# Handoff саме цього чату: express workflow та перевірка оновлень

Це відновлений технічний контекст конкретної роботи в цьому чаті. Він складений із фактичного поточного коду, незакоміченого `git diff` і тестів. Це не переказ `AGENTS.md`.

## Що зараз реалізовується

У React Native/Firebase застосунку FoEChat реалізовується повний життєвий цикл запланованої експрес-прокачки ВС, згрупованої за `chatId` і часом старту `T`:

1. набір учасників;
2. початковий відбір;
3. підтвердження власників та учасників;
4. добір із резерву;
5. скасування при нестачі людей;
6. фінальне сортування вкладників;
7. перенесення і ручне скасування власних ВС;
8. завершення прокачки конкретної ВС;
9. push-навігація на екран express;
10. заборона дублювання активного express для тієї самої ВС.

## Фактична структура даних, на яку переведено код

Основна група:

```text
/guilds/{guildId}/express/{chatId}
```

Приблизна структура:

```js
{
  scheduleTime: T,
  gbs: {
    gbRecordId: {
      allowedGB: "The Arc",
      user: "ownerUserId",
      levelThreshold: 5,
      rank: 1
    }
  },
  interested: {
    userId: {
      owner: false,
      contributionMultiplier: 1.9,
      confirmationTime: 123456789 // лише після підтвердження
    }
  },
  ranks: { userId: 3 },
  reserve: {},
  reserveSelected: {},
  selectedOrder: [],
  finalOrder: {},
  workflow: { stage: "open" }
}
```

Старі flat express records ще читаються UI через compatibility normalization, але scheduler їх свідомо не обробляє як новий workflow.

## Реалізовані частини

### Backend state machine

Додано `functions/expressWorkflow.js` з чистою функцією `advanceExpress()`.

Реалізовані переходи:

- `open` → recruitment check біля `T - 15`;
- `open` → `postponement`, якщо біля `T - 10` доступно менше шести унікальних користувачів;
- `open` → `initial_confirmation`, якщо доступно щонайменше шість;
- `initial_confirmation` → видалення або `reserve_confirmation` біля `T - 5`;
- `reserve_confirmation` → видалення або `final` біля `T - 2`;
- failed/postponement express видаляється біля початкового `T`.

Cloud Function `processScheduledExpressUpgrades` запускається щохвилини в регіоні `europe-west1`, читає guild express groups і застосовує reducer у Firebase transaction.

### Унікальний підрахунок

`uniqueAvailableIds()` об'єднує власників із `gbs` та записи `interested` у `Set`. Тому користувач, який одночасно є власником і зацікавленим, рахується один раз.

### Початковий відбір

`selectInitial()`:

- завжди включає всіх власників;
- виключає власників із non-owner candidate list;
- сортує кандидатів за `contributionMultiplier DESC`, потім `rank ASC`;
- добирає лише дефіцит до шести;
- залишає інших кандидатів у раніше впорядкованому `reserve`;
- якщо власників шість або більше, не додає невласників, але зберігає їх у резерві.

### Перевірка на `T - 5`

Код спочатку перевіряє власників:

- якщо не підтвердився жоден власник, формує потрібні notices і видаляє весь express;
- якщо частина власників підтвердилась, ВС непідтверджених власників видаляються, а чужі ВС зберігаються;
- непідтверджені невласники видаляються тільки зі selected records;
- дефіцит обчислюється як `max(0, 6 - confirmedCount)`;
- із резерву беруться тільки перші `n` користувачів без повторного сортування;
- другий reserve round не створюється.

### Фінальний порядок на `T - 2`

Підтверджені користувачі сортуються за:

1. `contributionMultiplier DESC`;
2. `confirmationTime ASC`;
3. `rank ASC`;
4. user ID як детермінований останній tie-breaker.

Результат записується у `finalOrder`.

### Підтвердження в UI

На етапах `initial_confirmation` і `reserve_confirmation`:

- власник бачить `Підтвердити свої наміри`;
- невласник бачить `Підтвердити своє бажання`;
- запис `confirmationTime` виконується transaction-ом;
- використовується `database.ServerValue.TIMESTAMP`;
- повторне натискання не перезаписує вже наявний timestamp;
- під час запису кнопки блокуються через `busy`.

### Видимість картки та кнопки

У `components/GB/GBExpress.js` реалізовано:

- `postponement`: картку бачать лише власники;
- confirmation stages: картку бачать лише selected users;
- `final`: картку бачать лише користувачі з `finalOrder`;
- лічильник людей відображається лише власнику хоча б однієї ВС у картці;
- до selection невласник бачить `Взяти участь`/`Скасувати`;
- власник бачить owner cancellation;
- у postponement власник бачить `Скасувати` та `Відтермінувати`;
- після final попередні action buttons прибираються.

### Owner cancellation

- Для однієї власної ВС показується confirm modal із `Так`/`Ні`.
- Для кількох власних ВС показується checkbox modal.
- У modal усі ВС попередньо вибрані.
- Confirm вимкнений, якщо не вибрано жодної ВС.
- Transaction перевіряє власника кожного GB record і не видаляє чужі ВС.
- Якщо власник видалив усі свої ВС, але чужі залишилися, показується modal із пропозицією приєднатися до решти express.
- Після пізнього ручного скасування Firebase trigger готує один push кожному підтвердженому користувачу.

### Postponement

- Одна власна ВС відкриває форму одразу.
- Для кількох ВС відкривається selector modal.
- Форма показує блок `ВС для відтермінування` зі своїм вертикальним scroll.
- Початково пропонується `T + 30 хв`.
- Save додатково відхиляє час раніше `T + 30 хв`.
- В одну нову групу переносяться лише вибрані ВС поточного власника.
- Інші ВС залишаються в оригінальній групі.
- Нова postponed group створюється без interested users.
- При першому успішному перенесенні стара interested-аудиторія snapshot-иться, старий interested очищається, а повторне сповіщення блокується маркером.

### Final tables і completion

- Для кожної ВС показується окрема таблиця `Місце` / `Вкладник`.
- Власник конкретної ВС виключається саме з її таблиці.
- Власники інших ВС залишаються вкладниками.
- Після виключення власника місця нумеруються заново від 1.
- Показуються avatar і login/name.
- `Прокачка закінченна` бачить лише власник конкретної ВС.
- Кнопка відображається з `T - 2`, але заблокована до `T`.
- Для перевірки часу UI використовує Firebase `.info/serverTimeOffset`.
- Completion transaction видаляє тільки конкретну ВС; остання ВС видаляє всю групу.

### Push та навігація

- Додано notification type `express_upgrade`.
- Додано Android channel `express_upgrade` зі звуком `kirpich`.
- Payload містить `type`, `screen: "GBExpress"`, `guildId`, `chatId`.
- `MainContent` направляє `express_upgrade` на існуючий маршрут `GB → GBExpress`.
- Type додано в загальну normalization/routing logic, яка вже обслуговує foreground, background і cold-start потоки.
- Для deduplication створено ledger `/expressNotificationLedger/{guildId}/{chatId}/{event_userId}`.

### Duplicate scheduling

- `MyGB.js` розпізнає як нові grouped records, так і legacy flat records.
- `MyGBCenterScreen.js` ховає scheduling action для active GB IDs.
- `GBNewExpress.js` виключає active GB із dropdown.
- Shared save path використовує transaction і відмовляє, якщо така ВС уже присутня в active express.

## Реалізовані автоматичні тести

У `functions/expressWorkflow.test.js` є 4 конкретні кейси:

1. Власник одночасно присутній в `interested` — рахується лише один раз.
2. Коли власників шість, усі шість залишаються selected, а невласники залишаються у впорядкованому резерві.
3. На `T - 5` резерв заповнює саме фактичний дефіцит підтверджених, а не кількість видалених.
4. Final order використовує multiplier, потім confirmation time, потім rank.

Виконана перевірка:

```text
node --test functions/expressWorkflow.test.js
```

Результат: tests passed. Також `node --check` успішний для `functions/expressWorkflow.js` і `functions/index.js`.

## Приклади поведінки

### Приклад 1: один користувач є власником і interested

Є власники `u1`, `u2`; в interested є `u1`, `u3`. Результат availability count — 3, а не 4.

### Приклад 2: шість власників

Є шість різних власників та двоє interested users. Selected set містить усіх шістьох власників. Двоє невласників не отримують initial confirmation push і залишаються в reserve.

### Приклад 3: дефіцит після підтверджень

Спочатку selected users було шість. До `T - 5` підтвердилися власник і три учасники, двоє не підтвердилися. Confirmed count = 4, тому shortage = 2. Із резерву беруться рівно перші двоє, навіть якщо початково selected set міг бути більшим.

### Приклад 4: кілька власників

В express є ВС власників `A` і `B`. `A` підтвердився, `B` — ні. На `T - 5` видаляються selected record власника `B` та всі ВС, що належать `B`. ВС власника `A` залишаються.

### Приклад 5: таблиця для конкретної ВС

Final order: `A, X, B, Y, Z, Q`, де `A` — власник першої ВС, `B` — власник другої. Для ВС власника `A` таблиця буде `X, B, Y, Z, Q` з місцями 1–5. Для ВС власника `B` таблиця буде `A, X, Y, Z, Q`.

### Приклад 6: часткове перенесення

Власник має три ВС у failed express і вибирає дві. Ці дві атомарно створюються в новому `chatId`, а з оригінального видаляються. Третя ВС та ВС інших власників залишаються в оригінальній картці.

## Ще треба реалізувати або підтвердити

Нижче — не загальні побажання, а конкретні прогалини, виявлені в поточному коді.

### Високий пріоритет

1. **Надійність push ledger після збою.** Зараз ledger спочатку переходить у `claimed`, потім виконується send. Якщо функція впаде між цими діями, наступний запуск побачить ledger і не повторить push. Потрібна recoverable claim/retry модель або transactional outbox.

2. **Видалення після notices не повністю crash-safe.** Scheduler спочатку ставить stage `deleting`, надсилає pushes, потім видаляє branch. Якщо процес упаде після переходу в `deleting`, повторний reducer повертає delete без відновлення початкового списку notices. Є ризик видалити express без усіх потрібних повідомлень.

3. **Recruitment eligibility.** Backend бере всіх `guildUsers`, крім owners/interested. Треба перевірити й застосувати фактичні критерії eligible users та server-side виключення ботів/службових акаунтів.

4. **FCM token lookup.** `sendExpressPush` зараз читає лише `/users/{userId}/fcmToken`. Треба звірити з реальною схемою токенів застосунку, включно з multi-device records, і використати існуючий sender/deduplication шлях.

5. **Duplicate filtering має враховувати власника.** У `MyGBCenterScreen` і dropdown збираються лише `allowedGB` з усієї гільдії. Якщо різні користувачі мають однаковий тип ВС, express одного користувача може помилково приховати кнопку іншому. Треба фільтрувати active records за поточним `userId`.

6. **`Змінити вибір` не повертає modal гарантовано.** Зараз кнопка у postponement form викликає тільки `navigation.goBack()`. Потрібно відновлювати саме selector modal із попереднім вибором.

7. **Повна атомарність first-postponement notification state.** Треба перевірити конкурентні save від одного власника/різних власників, щоб snapshot interested, marker і перенесення пакетів не породжували повторів або втрат.

### Необхідні додаткові тести

- менше шести на `T - 15`, але шість уже є на `T - 10`;
- менше шести на `T - 10` → postponement;
- owners exactly 6 і owners > 6;
- жоден власник не підтвердився;
- частина власників підтвердилася, частина ні;
- один власник має кілька ВС і одне confirmation покриває всі;
- selected set > 6 і після відмов усе ще є 6 confirmed — резерв не потрібен;
- резерв коротший за shortage;
- reserve user підтверджується одночасно з `T - 2` transaction;
- однакові multiplier; однакові multiplier + confirmationTime;
- repeated scheduler invocation на кожному milestone;
- повторний tap confirmation/cancel/complete;
- ручне скасування однієї та кількох ВС;
- один push на recipient при видаленні кількох ВС;
- перенос одного пакета і кількох пакетів;
- два паралельні postponement attempts;
- cleanup невідкладених ВС у початковий `T`;
- completion однієї ВС при наявності інших і completion останньої;
- duplicate scheduling з обох entry points і concurrent submit;
- foreground/background/cold-start navigation integration;
- legacy flat records не ламають UI.

### UI/інтеграційні перевірки

- React Native components ще не пройшли lint/render tests у межах цієї перевірки.
- Не підтверджено на реальному Android, що custom sound `kirpich` відтворюється для FCM/notifee в усіх станах.
- Не перевірено Firebase emulator integration для transaction races і Cloud Functions triggers.
- Не перевірено security rules для нових шляхів `workflow`, `reserve`, `finalOrder` та notification ledger.
- Потрібно перевірити, чи поточна Firebase schema справді дозволяє server worker читати Arc level і всі актуальні device tokens.

## Окремо обговорена перевірка оновлень застосунку

`components/AppUpdate/AppUpdateChecker.js` монтується в кореневому `App.js`.

Тригер — `useEffect(..., [])`:

- запускається один раз після монтування компонента;
- працює лише на Android;
- фактично виконується при новому запуску/монтуванні застосунку;
- повернення з background не запускає повторну перевірку;
- `hasChecked` блокує повтор у тому самому instance;
- `activeUpdateCheck` блокує паралельні однакові запити.

`checkForAndroidUpdate()` у `services/appUpdateService.js` читає:

```text
appReleases/android/stable
```

і порівнює `release.build` з `Application.nativeBuildVersion`. Кнопка `Оновити` поки що є заглушкою та APK не завантажує.

## Поточні файли реалізації

- `functions/expressWorkflow.js`
- `functions/expressWorkflow.test.js`
- `functions/index.js`
- `components/GB/GBExpress.js`
- `components/GB/GBNewExpress.js`
- `components/GB/MyGB.js`
- `components/GB/MyGBCenterScreen.js`
- `components/MainContent.js`
- `src/notifications/notificationRouting.js`
- `android/app/src/main/res/raw/kirpich.mp3`

Це незакомічена робота. Перед продовженням не відкидати її; спочатку перевірити `git status` і `git diff`.

## Готовий prompt для продовження в іншому ChatGPT

> Це handoff незавершеної реалізації scheduled express-upgrade workflow у React Native/Firebase застосунку FoEChat. Прочитай цей файл, поточний `git diff`, `functions/expressWorkflow.js`, його тести та пов'язані UI-файли. Не вважай реалізацію завершеною лише тому, що базові unit tests проходять. Спочатку перевір конкретні прогалини з розділу «Ще треба реалізувати або підтвердити», потім виправляй їх малими узгодженими змінами. Збережи існуючу Firebase architecture, route `GBExpress`, server timestamps, наявний rank lifecycle і точні українські UI/push strings. Не відкидай незакомічені зміни. Після правок запусти unit, syntax, integration/lint перевірки, а у звіті розділи: підтверджено готове, частково готове, неготове та неперевірене.
