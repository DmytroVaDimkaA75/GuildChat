import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const deepMerge = (target, source) => {
  const output = Array.isArray(target) ? [...target] : { ...target };
  if (!source) return output;

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = output[key];

    if (Array.isArray(sourceValue)) {
      output[key] = [...sourceValue];
    } else if (sourceValue && typeof sourceValue === "object") {
      output[key] = deepMerge(targetValue && typeof targetValue === "object" ? targetValue : {}, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });

  return output;
};

const ukTranslation = {
  welcome: "Ласкаво просимо",
  server: "Сервер",
  cultureResources: {
    fish: "рибу",
    spice: "спеції",
    rum: "ром",
    cannons: "гармати",
    doubloons: "дублони"
  },
  roleSelection: {
    title: "Виберіть роль:",
    admin: "Адміністратор",
    user: "Звичайний користувач"
  },
  adminSettings: {
    apply: "Застосувати",
    guildIdPlaceholder: "ID гільдії",
    selectServerTitle: "Виберіть сервер:",
    selectWorldTitle: "Виберіть світ:",
    close: "Закрити",
    defaultWorld: "Світ",
    guildNotFoundTitle: "Гільдія не знайдена",
    guildNotFoundMessage: "Гільдія з ID {{guildId}} не знайдена у вибраному вами світі на цьому сервері.",
    ok: "OK",
    timeoutError: "Перевищено час очікування."
  },
  userSettings: {
    requestAccessCode: "Запросіть код доступу у голови гільдії",
    accessCodePlaceholder: "Код доступу",
    apply: "Прийняти",
    userNotFoundTitle: "Користувача не знайдено",
    userNotFoundMessage: "Спробуйте ввести інший пароль",
    noGuildsTitle: "Немає гільдій",
    noGuildsMessage: "Користувач не знаходиться в жодній гільдії",
    selectGuildTitle: "Виберіть гільдію:",
    close: "Закрити",
    ok: "OK"
  },
  chatStack: {
    chatScreenTitle: "Альтанка",
    guildMembersListTitle: "Нове повідомлення",
    newGroupChatTitle: "Створити групу",
    chatWindowTitle: "Чат"
  },
  gbStack: {
    gbScreenTitle: "Прокачка Величних Споруд",
    newGBChatTitle: "Нова гілка прокачки ВС",
    gbChatWindowTitle: "GBChatWindow",
    gbExpressTitle: "Експрес прокачка",
    gbNewExpressTitle: "Експрес прокачка"
  },
  quantStack: {
    quantScreenTitle: "Квантові вторгнення"
  },
  gbgStack: {
    gbgScreenTitle: "Поле битви гільдій"
  },
  gbgScreen: {
    mapTitles: {
      volcanic_archipelago: "Вулканічний архіпелаг",
      waterfall_archipelago: "Архіпелаг Водоспадів"
    },
    loaderText: "Завантаження карти...",
    listTitle: "Відкриття секторів",
    cacheButton: "Кеш",
    bonusLabel: "Бонус: {{value}}{{time}}",
    attritionBonusLabel: "Бонус {{value}}%",
    bonusTimeRemaining: " ({{time}})",
    emptySchedule: "Найближчим часом секторів немає",
    sectorNotifications: {
      muteTitle: "Не сигналізувати",
      thirtyMinutes: "30 хвилин",
      oneHour: "1 година",
      threeHours: "3 години",
      fiveHours: "5 годин",
      untilEndOfDay: "До кінця доби",
      attackSectors: "Сектори на атаку (до кінця доби)",
      defenseSectors: "Сектори на захист (до кінця доби)",
      untilEndOfSeason: "До кінця сезону",
      saveFailed: "Не вдалося зберегти налаштування сповіщень."
    },
    info: {
      title: "Суперники на мапі",
      empty: "Інформація відсутня",
      close: "Закрити"
    },
    popup: {
      help: "Допомагайте"
    },
    help: {
      sendingTitle: "Відправка...",
      sendingMessage: "Надсилаємо сповіщення всім членам гільдії.",
      successTitle: "Успіх!",
      successMessage: "Сповіщення надіслано."
    },
    errors: {
      title: "Помилка",
      guildNotFound: "Не вдалося визначити гільдію.",
      helpFailed: "Не вдалося надіслати сповіщення. Спробуйте пізніше.",
      cacheReadFailed: "Не вдалося прочитати кеш."
    },
    cache: {
      title: "Кеш віджета",
      updatedAt: "updatedAt:",
      next5: "widget_gbg_next5:",
      mapState: "widget_gbg_map_state:",
      mapXml: "widget_gbg_map_xml:",
      close: "Закрити"
    }
  },
  profileStack: {
    profileMainTitle: "Налаштування профілю",
    profileDataTitle: "Дані профілю",
    myGBTitle: "Мої Величні Споруди",
    addGBComponentTitle: "Додайте ВС до свого списку",
    gbNewExpressTitle: "Експрес прокачка",
    addScheduleTitle: "Графіки активності",
    sleepScheduleTitle: "Дані профілю",
    languageSelectorTitle: "Мова"
  },
  addSchedule: {
    header: "Ввімкнення сповіщень",
    description: "Ви будете отримувати сповіщення в час, заначений в графіках",
    suggestedTitle: "Запропоновані умови",
    activityTime: "Час активності",
    emptyText: "Збережених графіків активності поки немає.",
    weeklyTitle: "Щотижневий графік",
    datesTitle: "Графік за датами",
    noTimeSet: "Час не задано",
    selectedDaysCount: "обрано днів: {{count}}",
    daysShort: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"],
    deleteConfirmationTitle: "Видалення графіка",
    deleteConfirmationMessage: "Видалити цей графік активності?",
    cancel: "Скасувати",
    delete: "Видалити"
  },
  customDrawer: {
    addWorld: "Додати світ",
    noName: "Без назви"
  },
  drawer: {
    gbLabel: "Центр ВС",
    chatLabel: "Альтанка",
    quantLabel: "Квантові вторгнення",
    pbgLabel: "Поле битви гільдій",
    azbookLabel: "Абетка",
    serviseLabel: "Сервіси",
    profileLabel: "Профіль",
    adminLabel: "Адміністративна панель",
    culture: "Культурні поселення"
  },
  gbScreen: {
    userIdError: "Не вдалося отримати userId",
    guildIdError: "Не вдалося отримати guildId",
    roleError: "Не вдалося отримати роль користувача",
    loadUserDataError: "Помилка при завантаженні даних користувача:",
    gbTitle: "Прокачка Величних Споруд"
  },
  adminSelect: {
    title: "Оберіть свій акаунт",
    emptyMessage: "Гільдія не знайдена або дані відсутні",
    confirmationText: "Ви підтверджуєте свій акаунт?",
    confirmButton: "Підтвердити",
    cancelButton: "Відміна",
    accessCodeTitle: "Збережіть код доступу",
    accessCodeMessage: "Цей код знадобиться для входу у ваш акаунт після зміни або перевстановлення смартфона.",
    accessCodeLabel: "Ваш код доступу",
    copyAccessCode: "Скопіювати код",
    accessCodeCopiedTitle: "Код скопійовано",
    accessCodeCopiedMessage: "Збережіть його у надійному місці.",
    copyAccessCodeError: "Не вдалося скопіювати код доступу.",
    continueButton: "Продовжити",
    creationErrorTitle: "Помилка",
    creationErrorMessage: "Не вдалося створити акаунт. Спробуйте ще раз."
  },
  myGB: {
    asyncStorageError: "Guild ID або User ID не знайдено в AsyncStorage",
    deleteConfirmationTitle: "Підтвердження видалення",
    deleteConfirmationMessage: "Ви впевнені, що хочете видалити цей об'єкт?",
    cancel: "Скасувати",
    delete: "Видалити",
    imageNotAvailable: "Image not available",
    levelLabel: "Рівень:",
    scheduleExpress: "Запланувати експрес",
    noBuilds: "No great builds available"
  },
  addGBComponent: {
    emptyMessage: "Немає доступних ВС для додавання",
    addError: "Помилка додавання ВС"
  },
  newGBChat: {
    contributionRatioLabel: "Коефіцієнт внеску:",
    contributionRatioLabelWithCoefficient: "Коефіцієнт внеску: {{coefficient}}",
    allowedGBsLabel: "Дозволені в гілці ВС:",
    selectGBPlaceholder: "Оберіть ВС",
    levelThresholdLabel: "Мінімальний рівень ВС:",
    guildMembersLabel: "Учасники гільдії:",
    selectMembersPlaceholder: "Оберіть учасників",
    placeLimitLabel: "Обмеження місць:",
    createChatButton: "Створити новий чат",
    selectAllOption: "Обрати все",
    guildIdNotFound: "Guild ID не знайдено",
    createChatError: "Помилка при створенні чату:",
    fetchContributionError: "Помилка при отриманні даних з API:",
    noGuildUsers: "Немає користувачів гільдії",
    updateChatError: "Помилка оновлення чату",
    chatNameLabel: "Назва чату",
    chatNamePlaceholder: "Введіть назву чату",
    guildMembersListTitle: "Список учасників",
    guildMembersSelectTitle: "Вибір учасників",
    placeLimitOptions: "Варіанти місць",
    guildMembersSelectAll: "Обрати всіх",
    updateChatButton: "Оновити"
  },
  gbGuarant: {
    levelNotFound: "Рівень не знайдено",
    levelBaseNotFound: "levelBase не знайдено",
    levelLabel: "Рівень",
    myContribution: "Мій вклад",
    addContributorButton: "Додати вкладника",
    contributorModalTitle: "Вкладник",
    selectContributorPlaceholder: "Оберіть вкладника...",
    contributionAmountTitle: "Розмір вкладу",
    contributionAmountPlaceholder: "Розмір вкладу",
    saveButton: "Зберегти",
    cancelButton: "Скасувати",
    fillAllFields: "Будь ласка, заповніть всі поля",
    optionStranger: "Чжинець",
    optionFriend: "Друг"
  },
  gbChatWindow: {
    unknownBuild: "Невідома ВС",
    unknownUser: "Невідомий",
    unknownLevel: "Невідомий рівень",
    noMessages: "Немає повідомлень",
    userDataError: "Помилка отримання даних користувача:",
    messagesError: "Помилка отримання повідомлень:",
    buildingDataError: "Помилка отримання даних про ВС:",
    buildingLevelError: "Помилка отримання рівня ВС:",
    todayAt: "Сьогодні о",
    yesterdayAt: "Вчора о",
    at: "о",
    placeSelectedTitle: "Місце вибрано",
    placeSelectedMessage: "Ви вибрали місце",
    placeUpdateError: "Помилка оновлення місця або excludedUser:",
    noPlaceValue: "Немає значення місця",
    levelLabel: "Рівень"
  },
  gbPatrons: {
    column1: "Вкладник",
    column2: "Вкладено",
    column3: "Вартість",
    column4: "До гаранту",
    column5: "Коефіцієнт",
    none: "Немає",
    leftColumnTitle: "Місце",
    guaranteed: "Гарантовано",
    stranger: "Чужинець",
    friend: "Друг",
    toLevelUp: "До прокачки",
    toLevelUpMsg: "Це місце вже гарантовано. Ви можете зайняти його для прокачки!"
  },
  gbChatList: {
    noChats: "Немає доступних чатів",
    chatGroup: "Прокачка під {{multiplier}}",
    fetchError: "Помилка отримання чатів:",
    arcNotFound: "Дані про арку не знайдено",
    arcFetchError: "Помилка отримання рівня арки:",
    express: "Експрес",
  },
  gbNewExpress: {
    selectBuilding: "ВС для експресу",
    selectBuildingPlaceholder: "Оберіть ВС",
    authError: "GuildId або UserId не знайдено в AsyncStorage",
    noData: "Дані не знайдено",
    fetchError: "Помилка отримання даних з Firebase:",
    levelThresholdLabel: "Орієнтовна кількість рівнів",
    placeLimitLabel: "Можливі місця для \"малюків\"",
    scheduleTime: "Запланувати час",
    setTime: "Призначте час",
    modalTitle: "Запланувати",
    saveButton: "Зберегти",
    today: "Сьогодні",
    tomorrow: "Завтра",
    specify: "Вкажіть час",
    loadingBuildingInfo: "Завантаження даних..."
  },
  dates: {
    days: ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"],
    months: [
      "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
      "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
    ]
  },
  datesShort: {
    days: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
    months: ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"]
  },
  adminStack: {
    adminScreenTitle: "Налаштування гільдії"
  },
  guildAdmin: {
    telegram: {
      title: "Telegram-сповіщення",
      description: "Підключіть власний канал без Bot Token і Chat ID. Сповіщення надходитимуть лише для активної гільдії.",
      loading: "Завантаження...",
      disconnected: "Telegram-канал ще не підключено.",
      connected: "Telegram підключено",
      channelFallback: "Telegram-канал",
      connect: "Підключити Telegram",
      reconnect: "Підключити знову",
      stepCreateChannel: "Створіть або виберіть канал у Telegram.",
      stepAddBot: "Додайте спільного бота застосунку до каналу як адміністратора з правом публікувати повідомлення.",
      stepPublishCommand: "Опублікуйте наведену нижче команду безпосередньо в цьому каналі.",
      botLabel: "Бот",
      addBot: "Додати бота до каналу",
      commandLabel: "Команда для публікації",
      copiedTitle: "Скопійовано",
      copiedMessage: "Команду скопійовано в буфер обміну.",
      waiting: "Очікуємо підтвердження від Telegram…",
      expiresIn: "Код діє ще {{time}}",
      codeExpired: "Термін дії коду завершився. Створіть новий код.",
      newCode: "Створити новий код",
      pendingCodeLost: "Для гільдії вже створювався код. З міркувань безпеки він не зберігається у відкритому вигляді — створіть новий.",
      test: "Надіслати тест",
      testSentTitle: "Telegram",
      testSentMessage: "Тестове повідомлення надіслано в канал.",
      testFailed: "Не вдалося надіслати тестове повідомлення.",
      disconnect: "Від’єднати",
      disconnectTitle: "Від’єднати Telegram?",
      disconnectMessage: "Сповіщення цієї гільдії більше не надходитимуть у підключений канал.",
      cancel: "Скасувати",
      disconnectConfirm: "Від’єднати",
      disconnectedTitle: "Telegram від’єднано",
      disconnectedMessage: "Канал більше не прив’язаний до цієї гільдії. За потреби видаліть бота з каналу в Telegram.",
      disconnectFailed: "Не вдалося від’єднати Telegram.",
      setupFailed: "Не вдалося створити код підключення.",
      errorTitle: "Помилка",
      permissionDenied: "Підключати Telegram може лише адміністратор, тестер або розробник цієї гільдії.",
      botNotConfigured: "Спільний Telegram-бот ще не налаштований розробником застосунку.",
      webhookUnavailable: "Не вдалося визначити адресу Telegram webhook після розгортання функцій.",
      botNotAdmin: "Бот не має прав адміністратора або права публікувати повідомлення в цьому каналі.",
      alreadyBound: "Цей Telegram-канал уже прив’язаний до іншої гільдії.",
      wrongBot: "Команду адресовано іншому Telegram-боту.",
      connectionLost: "Бот більше не має доступу до каналу або права публікувати повідомлення.",
      connectionError: "З’єднання з Telegram потребує відновлення",
      bindingBusy: "Прив’язка вже обробляється. Зачекайте кілька секунд.",
      tooSoon: "Зачекайте {{seconds}} с і повторіть спробу.",
      telegramUnavailable: "Telegram тимчасово недоступний. Спробуйте пізніше.",
      openBotFailed: "Не вдалося відкрити Telegram.",
      genericError: "Не вдалося виконати дію. Перевірте інтернет і повторіть спробу."
    }
  },
  chatList: {
    title: "Повідомлення",
    privateLabel: "Приватний чат",
    groupLabel: "Груповий чат",
    emptyTitle: "Немає доступних чатів",
    emptySubtitle: "Розпочніть нову розмову вже зараз"
  },
  chatScreen: {
    listenError: "Помилка при прослуховуванні чату"
  }
};

const ruTranslation = {
  welcome: "Добро пожаловать",
  server: "Сервер",
  cultureResources: {
    fish: "рыбу",
    spice: "специи",
    rum: "ром",
    cannons: "пушки",
    doubloons: "дублоны"
  },
  roleSelection: {
    title: "Выберите роль:",
    admin: "Администратор",
    user: "Обычный пользователь"
  },
  adminSettings: {
    apply: "Применить",
    guildIdPlaceholder: "ID гильдии",
    selectServerTitle: "Выберите сервер:",
    selectWorldTitle: "Выберите мир:",
    close: "Закрыть",
    defaultWorld: "Мир",
    guildNotFoundTitle: "Гильдия не найдена",
    guildNotFoundMessage: "Гильдия с ID {{guildId}} не найдена в выбранном вами мире на этом сервере.",
    ok: "OK",
    timeoutError: "Превышено время ожидания."
  },
  userSettings: {
    requestAccessCode: "Запросите код доступа у главы гильдии",
    accessCodePlaceholder: "Код доступа",
    apply: "Принять",
    userNotFoundTitle: "Пользователь не найден",
    userNotFoundMessage: "Попробуйте ввести другой пароль",
    noGuildsTitle: "Нет гильдий",
    noGuildsMessage: "Пользователь не состоит ни в одной гильдии",
    selectGuildTitle: "Выберите гильдию:",
    close: "Закрыть",
    ok: "OK"
  },
  chatStack: {
    chatScreenTitle: "Беседка",
    guildMembersListTitle: "Новое сообщение",
    newGroupChatTitle: "Создать группу",
    chatWindowTitle: "Чат"
  },
  gbStack: {
    gbScreenTitle: "Прокачка Великих Сооружений",
    newGBChatTitle: "Новая ветка прокачки ВС",
    gbChatWindowTitle: "GBChatWindow",
    gbExpressTitle: "Экспресс прокачка",
    gbNewExpressTitle: "Экспресс прокачка"
  },
  quantStack: {
    quantScreenTitle: "Квантовые вторжения"
  },
  gbgStack: {
    gbgScreenTitle: "Поле битвы гильдий"
  },
  gbgScreen: {
    mapTitles: {
      volcanic_archipelago: "Вулканический архипелаг",
      waterfall_archipelago: "Архипелаг Водопадов"
    },
    loaderText: "Загрузка карты...",
    listTitle: "Открытие секторов",
    cacheButton: "Кэш",
    bonusLabel: "Бонус: {{value}}{{time}}",
    attritionBonusLabel: "Бонус {{value}}%",
    bonusTimeRemaining: " ({{time}})",
    emptySchedule: "В ближайшее время нет секторов",
    sectorNotifications: {
      muteTitle: "Не уведомлять",
      thirtyMinutes: "30 минут",
      oneHour: "1 час",
      threeHours: "3 часа",
      fiveHours: "5 часов",
      untilEndOfDay: "До конца суток",
      attackSectors: "Секторы на атаку (до конца суток)",
      defenseSectors: "Секторы на защиту (до конца суток)",
      untilEndOfSeason: "До конца сезона",
      saveFailed: "Не удалось сохранить настройки уведомлений."
    },
    info: {
      title: "Соперники на карте",
      empty: "Информация отсутствует",
      close: "Закрыть"
    },
    popup: {
      help: "Помогайте"
    },
    help: {
      sendingTitle: "Отправка...",
      sendingMessage: "Отправляем уведомление всем членам гильдии.",
      successTitle: "Успех!",
      successMessage: "Уведомление отправлено."
    },
    errors: {
      title: "Ошибка",
      guildNotFound: "Не удалось определить гильдию.",
      helpFailed: "Не удалось отправить уведомление. Попробуйте позже.",
      cacheReadFailed: "Не удалось прочитать кеш."
    },
    cache: {
      title: "Кэш виджета",
      updatedAt: "updatedAt:",
      next5: "widget_gbg_next5:",
      mapState: "widget_gbg_map_state:",
      mapXml: "widget_gbg_map_xml:",
      close: "Закрыть"
    }
  },
  profileStack: {
    profileMainTitle: "Настройка профиля",
    profileDataTitle: "Данные профиля",
    myGBTitle: "Мои Великие Сооружения",
    addGBComponentTitle: "Добавьте ВС в свой список",
    gbNewExpressTitle: "Экспресс прокачка",
    addScheduleTitle: "Графики активности",
    sleepScheduleTitle: "Данные профиля",
    languageSelectorTitle: "Язык"
  },
  addSchedule: {
    header: "Включение уведомлений",
    description: "Вы будете получать уведомления во время, указанное в графиках",
    suggestedTitle: "Предложенные условия",
    activityTime: "Время активности",
    emptyText: "Сохранённых графиков активности пока нет.",
    weeklyTitle: "Еженедельный график",
    datesTitle: "График по датам",
    noTimeSet: "Время не задано",
    selectedDaysCount: "выбрано дней: {{count}}",
    daysShort: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    deleteConfirmationTitle: "Удаление графика",
    deleteConfirmationMessage: "Удалить этот график активности?",
    cancel: "Отмена",
    delete: "Удалить"
  },
  customDrawer: {
    addWorld: "Добавить мир",
    noName: "Без названия"
  },
  drawer: {
    gbLabel: "Центр ВС",
    chatLabel: "Беседка",
    quantLabel: "Квантовые вторжения",
    pbgLabel: "Поле битвы гильдий",
    azbookLabel: "Азбука",
    serviseLabel: "Сервисы",
    profileLabel: "Профиль",
    adminLabel: "Административная панель",
    culture: "Культурные поселения"
  },
  gbScreen: {
    userIdError: "Не удалось получить userId",
    guildIdError: "Не удалось получить guildId",
    roleError: "Не удалось получить роль пользователя",
    loadUserDataError: "Ошибка при загрузке данных пользователя:",
    gbTitle: "Прокачка Великих Сооружений"
  },
  adminSelect: {
    title: "Выберите свой аккаунт",
    emptyMessage: "Гильдия не найдена или данные отсутствуют",
    confirmationText: "Вы подтверждаете свой аккаунт?",
    confirmButton: "Подтвердить",
    cancelButton: "Отмена",
    accessCodeTitle: "Сохраните код доступа",
    accessCodeMessage: "Этот код понадобится для входа в аккаунт после смены или переустановки смартфона.",
    accessCodeLabel: "Ваш код доступа",
    copyAccessCode: "Скопировать код",
    accessCodeCopiedTitle: "Код скопирован",
    accessCodeCopiedMessage: "Сохраните его в надежном месте.",
    copyAccessCodeError: "Не удалось скопировать код доступа.",
    continueButton: "Продолжить",
    creationErrorTitle: "Ошибка",
    creationErrorMessage: "Не удалось создать аккаунт. Попробуйте еще раз."
  },
  myGB: {
    asyncStorageError: "Guild ID или User ID не найдены в AsyncStorage",
    deleteConfirmationTitle: "Подтверждение удаления",
    deleteConfirmationMessage: "Вы уверены, что хотите удалить этот объект?",
    cancel: "Отмена",
    delete: "Удалить",
    imageNotAvailable: "Image not available",
    levelLabel: "Уровень:",
    scheduleExpress: "Запланировать экспресс",
    noBuilds: "No great builds available"
  },
  addGBComponent: {
    emptyMessage: "Нет доступных ВС для добавления",
    addError: "Ошибка добавления ВС"
  },
  newGBChat: {
    contributionRatioLabel: "Коэффициент вклада:",
    contributionRatioLabelWithCoefficient: "Коэффициент вклада: {{coefficient}}",
    allowedGBsLabel: "Разрешенные в ветке ВС:",
    selectGBPlaceholder: "Выберите ВС",
    levelThresholdLabel: "Минимальный уровень ВС:",
    guildMembersLabel: "Участники гильдии:",
    selectMembersPlaceholder: "Выберите участников",
    placeLimitLabel: "Ограничение мест:",
    createChatButton: "Создать новый чат",
    selectAllOption: "Выбрать все",
    guildIdNotFound: "Guild ID не найден",
    createChatError: "Ошибка при создании чату:",
    fetchContributionError: "Ошибка при получении данных с API:",
    noGuildUsers: "Нет пользователей гильдии",
    updateChatError: "Ошибка обновления чата",
    chatNameLabel: "Название чата",
    chatNamePlaceholder: "Введите название чата",
    guildMembersListTitle: "Список участников",
    guildMembersSelectTitle: "Выбор участников",
    placeLimitOptions: "Варианты мест",
    guildMembersSelectAll: "Выбрать всех",
    updateChatButton: "Обновить"
  },
  gbGuarant: {
    levelNotFound: "Уровень не найден",
    levelBaseNotFound: "Базовый уровень не найден",
    levelLabel: "Уровень",
    myContribution: "Мой вклад",
    addContributorButton: "Добавить вкладчика",
    contributorModalTitle: "Вкладчик",
    selectContributorPlaceholder: "Выберите вкладчика...",
    contributionAmountTitle: "Размер вклада",
    contributionAmountPlaceholder: "Размер вклада",
    saveButton: "Сохранить",
    cancelButton: "Отмена",
    fillAllFields: "Пожалуйста, заполните все поля",
    optionStranger: "Чужинець",
    optionFriend: "Друг"
  },
  gbChatWindow: {
    unknownBuild: "Неизвестное ВС",
    unknownUser: "Неизвестный",
    unknownLevel: "Неизвестный уровень",
    noMessages: "Нет сообщений",
    userDataError: "Ошибка получения данных пользователя:",
    messagesError: "Ошибка получения сообщений:",
    buildingDataError: "Ошибка получения данных о ВС:",
    buildingLevelError: "Ошибка получения уровня ВС:",
    todayAt: "Сегодня в",
    yesterdayAt: "Вчера в",
    at: "в",
    placeSelectedTitle: "Место выбрано",
    placeSelectedMessage: "Вы выбрали место",
    placeUpdateError: "Ошибка обновления места или excludedUser:",
    noPlaceValue: "Нет значения места",
    levelLabel: "Уровень"
  },
  gbPatrons: {
    column1: "Вкладчик",
    column2: "Вложено",
    column3: "Стоимость",
    column4: "До гарантии",
    column5: "Коэффициент",
    none: "Нет",
    leftColumnTitle: "Место",
    guaranteed: "Гарантировано",
    stranger: "Чужой",
    friend: "Друг",
    toLevelUp: "К прокачке",
    toLevelUpMsg: "Это место уже гарантировано. Вы можете занять его для прокачки!"
  },
  gbChatList: {
    noChats: "Нет доступных чатов",
    chatGroup: "Прокачка под {{multiplier}}",
    fetchError: "Ошибка получения чатов:",
    arcNotFound: "Данные об арке не найдены",
    arcFetchError: "Ошибка получения уровня арки:",
    express: "Экспресс",
  },
  gbNewExpress: {
    selectBuilding: "ВС для экспресса",
    selectBuildingPlaceholder: "Выберите ВС",
    authError: "GuildId или UserId не найдены в AsyncStorage",
    noData: "Данные не найдены",
    fetchError: "Ошибка получения данных с Firebase:",
    levelThresholdLabel: "Примерное количество уровней",
    placeLimitLabel: "Возможные места для \"малышей\"",
    scheduleTime: "Запланировать время",
    setTime: "Назначьте время",
    modalTitle: "Запланировать",
    saveButton: "Сохранить",
    today: "Сегодня",
    tomorrow: "Завтра",
    specify: "Укажите время",
    loadingBuildingInfo: "Загрузка данных..."
  },
  dates: {
    days: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
    months: [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ]
  },
  datesShort: {
    days: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
    months: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
  },
  adminStack: {
    adminScreenTitle: "Настройки гильдии"
  },
  guildAdmin: {
    telegram: {
      title: "Telegram-уведомления",
      description: "Подключите свой канал без Bot Token и Chat ID. Уведомления будут приходить только для активной гильдии.",
      loading: "Загрузка...",
      disconnected: "Telegram-канал ещё не подключён.",
      connected: "Telegram подключён",
      channelFallback: "Telegram-канал",
      connect: "Подключить Telegram",
      reconnect: "Подключить снова",
      stepCreateChannel: "Создайте или выберите канал в Telegram.",
      stepAddBot: "Добавьте общего бота приложения в канал как администратора с правом публикации сообщений.",
      stepPublishCommand: "Опубликуйте указанную ниже команду непосредственно в этом канале.",
      botLabel: "Бот",
      addBot: "Добавить бота в канал",
      commandLabel: "Команда для публикации",
      copiedTitle: "Скопировано",
      copiedMessage: "Команда скопирована в буфер обмена.",
      waiting: "Ожидаем подтверждения от Telegram…",
      expiresIn: "Код действует ещё {{time}}",
      codeExpired: "Срок действия кода истёк. Создайте новый код.",
      newCode: "Создать новый код",
      pendingCodeLost: "Для гильдии уже создавался код. В целях безопасности он не хранится в открытом виде — создайте новый.",
      test: "Отправить тест",
      testSentTitle: "Telegram",
      testSentMessage: "Тестовое сообщение отправлено в канал.",
      testFailed: "Не удалось отправить тестовое сообщение.",
      disconnect: "Отключить",
      disconnectTitle: "Отключить Telegram?",
      disconnectMessage: "Уведомления этой гильдии больше не будут приходить в подключённый канал.",
      cancel: "Отмена",
      disconnectConfirm: "Отключить",
      disconnectedTitle: "Telegram отключён",
      disconnectedMessage: "Канал больше не связан с этой гильдией. При необходимости удалите бота из канала в Telegram.",
      disconnectFailed: "Не удалось отключить Telegram.",
      setupFailed: "Не удалось создать код подключения.",
      errorTitle: "Ошибка",
      permissionDenied: "Подключать Telegram может только администратор, тестер или разработчик этой гильдии.",
      botNotConfigured: "Общий Telegram-бот ещё не настроен разработчиком приложения.",
      webhookUnavailable: "Не удалось определить адрес Telegram webhook после развёртывания функций.",
      botNotAdmin: "У бота нет прав администратора или права публиковать сообщения в этом канале.",
      alreadyBound: "Этот Telegram-канал уже связан с другой гильдией.",
      wrongBot: "Команда адресована другому Telegram-боту.",
      connectionLost: "У бота больше нет доступа к каналу или права публиковать сообщения.",
      connectionError: "Соединение с Telegram нужно восстановить",
      bindingBusy: "Привязка уже обрабатывается. Подождите несколько секунд.",
      tooSoon: "Подождите {{seconds}} с и повторите попытку.",
      telegramUnavailable: "Telegram временно недоступен. Попробуйте позже.",
      openBotFailed: "Не удалось открыть Telegram.",
      genericError: "Не удалось выполнить действие. Проверьте интернет и повторите попытку."
    }
  },
  chatList: {
    title: "Сообщения",
    privateLabel: "Приватный чат",
    groupLabel: "Групповой чат",
    emptyTitle: "Нет доступных чатов",
    emptySubtitle: "Начните новый разговор прямо сейчас"
  },
  chatScreen: {
    listenError: "Ошибка при прослушивании чата"
  }
};

const beTranslation = {
  welcome: "Сардэчна запрашаем",
  server: "Сервер",
  cultureResources: {
    fish: "рыбу",
    spice: "спецыі",
    rum: "ром",
    cannons: "гарматы",
    doubloons: "дублоны"
  },
  roleSelection: {
    title: "Выберыце ролю:",
    admin: "Адміністратар",
    user: "Звычайны карыстальнік"
  },
  adminSettings: {
    apply: "Прымяніць",
    guildIdPlaceholder: "ID гільдыі",
    selectServerTitle: "Абярыце сервер:",
    selectWorldTitle: "Абярыце свет:",
    close: "Закрыць",
    defaultWorld: "Свят",
    guildNotFoundTitle: "Гільдыя не знойдзена",
    guildNotFoundMessage: "Гільдыя з ID {{guildId}} не знойдзена ў абраным вамі свеце на гэтым серверы.",
    ok: "OK",
    timeoutError: "Перавышаны час чакання."
  },
  userSettings: {
    requestAccessCode: "Запытайце код доступу ў старшыні гільдыі",
    accessCodePlaceholder: "Код доступу",
    apply: "Прымаць",
    userNotFoundTitle: "Карыстальніка не знойдзена",
    userNotFoundMessage: "Паспрабуйце ўвесці іншы пароль",
    noGuildsTitle: "Няма гільдый",
    noGuildsMessage: "Карыстальнік не ўваходзіць у ніякую гільдыю",
    selectGuildTitle: "Абярыце гільдыю:",
    close: "Закрыць",
    ok: "OK"
  },
  chatStack: {
    chatScreenTitle: "Альтанка",
    guildMembersListTitle: "Новае паведамленне",
    newGroupChatTitle: "Стварыць групу",
    chatWindowTitle: "Чат"
  },
  gbStack: {
    gbScreenTitle: "Прокачка Вялікіх Споруд",
    newGBChatTitle: "Новая галіна прокачкі ВС",
    gbChatWindowTitle: "GBChatWindow",
    gbExpressTitle: "Экспрэс прокачка",
    gbNewExpressTitle: "Экспрэс прокачка"
  },
  quantStack: {
    quantScreenTitle: "Квантаваныя ўварванні"
  },
  gbgStack: {
    gbgScreenTitle: "Поле бітвы гільдый"
  },
  gbgScreen: {
    mapTitles: {
      volcanic_archipelago: "Вулканічны архіпелаг",
      waterfall_archipelago: "Архіпелаг Вадаспадаў"
    },
    loaderText: "Загрузка мапы...",
    listTitle: "Адкрыццё сектараў",
    cacheButton: "Кэш",
    bonusLabel: "Бонус: {{value}}{{time}}",
    attritionBonusLabel: "Бонус {{value}}%",
    bonusTimeRemaining: " ({{time}})",
    emptySchedule: "Бліжэйшым часам сектараў няма",
    sectorNotifications: {
      muteTitle: "Не апавяшчаць",
      thirtyMinutes: "30 хвілін",
      oneHour: "1 гадзіна",
      threeHours: "3 гадзіны",
      fiveHours: "5 гадзін",
      untilEndOfDay: "Да канца сутак",
      attackSectors: "Сектары на атаку (да канца сутак)",
      defenseSectors: "Сектары на абарону (да канца сутак)",
      untilEndOfSeason: "Да канца сезона",
      saveFailed: "Не ўдалося захаваць налады апавяшчэнняў."
    },
    info: {
      title: "Супернікі на мапе",
      empty: "Інфармацыя адсутнічае",
      close: "Закрыць"
    },
    popup: {
      help: "Дапамагайце"
    },
    help: {
      sendingTitle: "Адпраўка...",
      sendingMessage: "Адпраўляем апавяшчэнне ўсім членам гільдыі.",
      successTitle: "Поспех!",
      successMessage: "Апавяшчэнне адпраўлена."
    },
    errors: {
      title: "Памылка",
      guildNotFound: "Не ўдалося вызначыць гільдыю.",
      helpFailed: "Не ўдалося адправіць апавяшчэнне. Паспрабуйце пазней.",
      cacheReadFailed: "Не ўдалося прачытаць кэш."
    },
    cache: {
      title: "Кэш віджэта",
      updatedAt: "updatedAt:",
      next5: "widget_gbg_next5:",
      mapState: "widget_gbg_map_state:",
      mapXml: "widget_gbg_map_xml:",
      close: "Закрыць"
    }
  },
  profileStack: {
    profileMainTitle: "Налада профілю",
    profileDataTitle: "Дадзеныя профілю",
    myGBTitle: "Мае Вялікія Спорудкі",
    addGBComponentTitle: "Дадайце ВС да свайго спісу",
    gbNewExpressTitle: "Экспрэс прокачка",
    addScheduleTitle: "Графікі актыўнасці",
    sleepScheduleTitle: "Дадзеныя профілю",
    languageSelectorTitle: "Мова"
  },
  addSchedule: {
    header: "Уключэнне апавяшчэнняў",
    description: "Вы будзеце атрымліваць апавяшчэнні ў час, пазначаны ў графіках",
    suggestedTitle: "Прапанаваныя ўмовы",
    activityTime: "Час актыўнасці",
    emptyText: "Захаваных графікаў актыўнасці пакуль няма.",
    weeklyTitle: "Штотыднёвы графік",
    datesTitle: "Графік па датах",
    noTimeSet: "Час не зададзены",
    selectedDaysCount: "абрана дзён: {{count}}",
    daysShort: ["Пн", "Аў", "Ср", "Чц", "Пт", "Сб", "Нд"],
    deleteConfirmationTitle: "Выдаленне графіка",
    deleteConfirmationMessage: "Выдаліць гэты графік актыўнасці?",
    cancel: "Скасаваць",
    delete: "Выдаліць"
  },
  customDrawer: {
    addWorld: "Дадаць свет",
    noName: "Без назвы"
  },
  drawer: {
    gbLabel: "Центр ВС",
    chatLabel: "Альтанка",
    quantLabel: "Квантаваныя ўварванні",
    pbgLabel: "Поле битвы гільдый",
    azbookLabel: "Азбука",
    serviseLabel: "Сэрвісы",
    profileLabel: "Профіль",
    adminLabel: "Адміністрацыйная панэль",
    culture: "Культурныя паселішчы"
  },
  gbScreen: {
    userIdError: "Не атрымалася атрымаць userId",
    guildIdError: "Не атрымалася атрымаць guildId",
    roleError: "Не атрымалася атрымаць ролю карыстальніка",
    loadUserDataError: "Памылка пры загрузцы даных карыстальніка:",
    gbTitle: "Прокачка Вялікіх Споруд"
  },
  adminSelect: {
    title: "Абярыце свой акаўнт",
    emptyMessage: "Гільдыя не знойдзена або даныя адсутнічаюць",
    confirmationText: "Ці пацвярджаеце вы свой акаўнт?",
    confirmButton: "Пацвердзіць",
    cancelButton: "Адмена",
    accessCodeTitle: "Захавайце код доступу",
    accessCodeMessage: "Гэты код спатрэбіцца для ўваходу пасля замены або пераўсталёўкі смартфона.",
    accessCodeLabel: "Ваш код доступу",
    copyAccessCode: "Скапіяваць код",
    accessCodeCopiedTitle: "Код скапіяваны",
    accessCodeCopiedMessage: "Захавайце яго ў надзейным месцы.",
    copyAccessCodeError: "Не ўдалося скапіяваць код доступу.",
    continueButton: "Працягнуць",
    creationErrorTitle: "Памылка",
    creationErrorMessage: "Не ўдалося стварыць акаўнт. Паспрабуйце яшчэ раз."
  },
  myGB: {
    asyncStorageError: "Guild ID або User ID не знойдзены ў AsyncStorage",
    deleteConfirmationTitle: "Пацвярджэнне выдалення",
    deleteConfirmationMessage: "Вы ўпэўнены, што жадаеце выдаліць гэты аб'ект?",
    cancel: "Скасаваць",
    delete: "Выдаліць",
    imageNotAvailable: "Image not available",
    levelLabel: "Роў:",
    scheduleExpress: "Запланаваць экспрэс",
    noBuilds: "No great builds available"
  },
  addGBComponent: {
    emptyMessage: "Няма доступных ВС для дадання",
    addError: "Памылка дадання ВС"
  },
  newGBChat: {
    contributionRatioLabel: "Каэфіцыент унёску:",
    contributionRatioLabelWithCoefficient: "Каэфіцыент унёску: {{coefficient}}",
    allowedGBsLabel: "Дазволеныя ў галіне ВС:",
    selectGBPlaceholder: "Оберіть ВС",
    levelThresholdLabel: "Мінімальны ўзровень ВС:",
    guildMembersLabel: "Удзельнікі гільдыі:",
    selectMembersPlaceholder: "Оберіть удзельників",
    placeLimitLabel: "Абмежаванне месцаў:",
    createChatButton: "Стварыць новы чат",
    selectAllOption: "Абраць усё",
    guildIdNotFound: "Guild ID не знойдзены",
    createChatError: "Памылка пры стварэнні чату:",
    fetchContributionError: "Памылка пры атрыманні даных з API:",
    noGuildUsers: "Няма карыстальнікаў гільдыі",
    updateChatError: "Памылка абнаўлення чату",
    chatNameLabel: "Назва чату",
    chatNamePlaceholder: "Увядзіце назву чату",
    guildMembersListTitle: "Спіс удзельнікаў",
    guildMembersSelectTitle: "Выбар удзельнікаў",
    placeLimitOptions: "Варыянты месцаў",
    guildMembersSelectAll: "Абраць усіх",
    updateChatButton: "Абнавіць"
  },
  gbGuarant: {
    levelNotFound: "Роўня не знойдзена",
    levelBaseNotFound: "levelBase не знойдзена",
    levelLabel: "Роўня",
    myContribution: "Мой уклад",
    addContributorButton: "Дадаць укладчыка",
    contributorModalTitle: "Укладчык",
    selectContributorPlaceholder: "Оберіть укладчыка...",
    contributionAmountTitle: "Памер ўкладу",
    contributionAmountPlaceholder: "Памер ўкладу",
    saveButton: "Захаваць",
    cancelButton: "Скасаваць",
    fillAllFields: "Калі ласка, запоўніце ўсе палі",
    optionStranger: "Чужынец",
    optionFriend: "Сябар"
  },
  gbChatWindow: {
    unknownBuild: "Невядомая ВС",
    unknownUser: "Невядомы",
    unknownLevel: "Невядомы ўзровень",
    noMessages: "Няма паведамленняў",
    userDataError: "Памылка пры атрыманні даных карыстальніка:",
    messagesError: "Памылка пры атрыманні паведамленняў:",
    buildingDataError: "Памылка пры атрыманні даных пра ВС:",
    buildingLevelError: "Памылка пры атрыманні ўзроўню ВС:",
    todayAt: "Сёння о",
    yesterdayAt: "Учора о",
    at: "о",
    placeSelectedTitle: "Месца выбрана",
    placeSelectedMessage: "Вы абралі месца",
    placeUpdateError: "Памылка абнаўлення месца або excludedUser:",
    noPlaceValue: "Няма значэння месца",
    levelLabel: "Роў"
  },
  gbPatrons: {
    column1: "Укладчык",
    column2: "Укладзена",
    column3: "Кошт",
    column4: "Да гаранта",
    column5: "Каэфіцыент",
    none: "Няма",
    leftColumnTitle: "Месца",
    guaranteed: "Гарантавана",
    stranger: "Чужынец",
    friend: "Сябар",
    toLevelUp: "Да пракачкі",
    toLevelUpMsg: "Гэта месца ўжо гарантавана. Вы можаце заняць яго для пракачкі!"
  },
  gbChatList: {
    noChats: "Няма даступных чатаў",
    chatGroup: "Прокачка пад {{multiplier}}",
    fetchError: "Памылка атрыманні чатаў:",
    arcNotFound: "Даныя пра арку не знойдзены",
    arcFetchError: "Памылка атрыманні ўзроўню аркі:",
    express: "Экспрэс",
  },
  gbNewExpress: {
    selectBuilding: "ВС для экспрэсу",
    selectBuildingPlaceholder: "Абярыце ВС",
    authError: "GuildId або UserId не знойдзены ў AsyncStorage",
    noData: "Даныя не знойдзены",
    fetchError: "Памылка атрыманні даных з Firebase:",
    levelThresholdLabel: "Прыкладная колькасць узроўняў",
    placeLimitLabel: "Магчымыя месцы для \"малышаў\"",
    scheduleTime: "Запланаваць час",
    setTime: "Вызначце час",
    modalTitle: "Запланаваць",
    saveButton: "Захаваць",
    today: "Сёння",
    tomorrow: "Заўтра",
    specify: "Пакажыце час",
    loadingBuildingInfo: "Загрузка даных..."
  },
  dates: {
    days: ["Нядзеля", "Панядзелак", "Аўторак", "Серада", "Чацвер", "Пятніца", "Субота"],
    months: [
      "Студзень", "Люты", "Сакавік", "Красавік", "Май", "Чэрвень",
      "Ліпень", "Жнівень", "Верасень", "Кастрычнік", "Лістапад", "Снежань"
    ]
  },
  datesShort: {
    days: ["нд", "пн", "ўт", "ср", "чц", "пт", "сб"],
    months: ["студ", "лют", "сака", "крас", "май", "чэр", "ліп", "жнів", "вера", "кас", "ліст", "сне"]
  },
  adminStack: {
    adminScreenTitle: "Налады гільдыі"
  },
  guildAdmin: {
    telegram: {
      title: "Telegram-апавяшчэнні",
      description: "Падключыце свой канал без Bot Token і Chat ID. Апавяшчэнні будуць прыходзіць толькі для актыўнай гільдыі.",
      loading: "Загрузка...",
      disconnected: "Telegram-канал яшчэ не падключаны.",
      connected: "Telegram падключаны",
      channelFallback: "Telegram-канал",
      connect: "Падключыць Telegram",
      reconnect: "Падключыць зноў",
      stepCreateChannel: "Стварыце або выберыце канал у Telegram.",
      stepAddBot: "Дадайце агульнага бота праграмы ў канал як адміністратара з правам публікаваць паведамленні.",
      stepPublishCommand: "Апублікуйце прыведзеную ніжэй каманду непасрэдна ў гэтым канале.",
      botLabel: "Бот",
      addBot: "Дадаць бота ў канал",
      commandLabel: "Каманда для публікацыі",
      copiedTitle: "Скапіявана",
      copiedMessage: "Каманда скапіявана ў буфер абмену.",
      waiting: "Чакаем пацвярджэння ад Telegram…",
      expiresIn: "Код дзейнічае яшчэ {{time}}",
      codeExpired: "Тэрмін дзеяння кода скончыўся. Стварыце новы код.",
      newCode: "Стварыць новы код",
      pendingCodeLost: "Для гільдыі ўжо ствараўся код. З меркаванняў бяспекі ён не захоўваецца ў адкрытым выглядзе — стварыце новы.",
      test: "Адправіць тэст",
      testSentTitle: "Telegram",
      testSentMessage: "Тэставае паведамленне адпраўлена ў канал.",
      testFailed: "Не ўдалося адправіць тэставае паведамленне.",
      disconnect: "Адключыць",
      disconnectTitle: "Адключыць Telegram?",
      disconnectMessage: "Апавяшчэнні гэтай гільдыі больш не будуць прыходзіць у падключаны канал.",
      cancel: "Скасаваць",
      disconnectConfirm: "Адключыць",
      disconnectedTitle: "Telegram адключаны",
      disconnectedMessage: "Канал больш не звязаны з гэтай гільдыяй. Пры неабходнасці выдаліце бота з канала ў Telegram.",
      disconnectFailed: "Не ўдалося адключыць Telegram.",
      setupFailed: "Не ўдалося стварыць код падключэння.",
      errorTitle: "Памылка",
      permissionDenied: "Падключаць Telegram можа толькі адміністратар, тэстар або распрацоўшчык гэтай гільдыі.",
      botNotConfigured: "Агульны Telegram-бот яшчэ не наладжаны распрацоўшчыкам праграмы.",
      webhookUnavailable: "Не ўдалося вызначыць адрас Telegram webhook пасля разгортвання функцый.",
      botNotAdmin: "Бот не мае правоў адміністратара або права публікаваць паведамленні ў гэтым канале.",
      alreadyBound: "Гэты Telegram-канал ужо звязаны з іншай гільдыяй.",
      wrongBot: "Каманда адрасавана іншаму Telegram-боту.",
      connectionLost: "Бот больш не мае доступу да канала або права публікаваць паведамленні.",
      connectionError: "Злучэнне з Telegram трэба аднавіць",
      bindingBusy: "Прывязка ўжо апрацоўваецца. Пачакайце некалькі секунд.",
      tooSoon: "Пачакайце {{seconds}} с і паўтарыце спробу.",
      telegramUnavailable: "Telegram часова недаступны. Паспрабуйце пазней.",
      openBotFailed: "Не ўдалося адкрыць Telegram.",
      genericError: "Не ўдалося выканаць дзеянне. Праверце інтэрнэт і паўтарыце спробу."
    }
  },
  chatList: {
    title: "Паведамленні",
    privateLabel: "Прыватны чат",
    groupLabel: "Групавы чат",
    emptyTitle: "Няма даступных чатаў",
    emptySubtitle: "Пачніце новую размову ўжо зараз"
  },
  chatScreen: {
    listenError: "Памылка пры праслухоўванні чату"
  }
};

const deTranslation = {
  welcome: "Willkommen",
  server: "Server",
  cultureResources: {
    fish: "Fisch",
    spice: "Gewürze",
    rum: "Rum",
    cannons: "Kanonen",
    doubloons: "Dublonen"
  },
  roleSelection: {
    title: "Wählen Sie eine Rolle:",
    admin: "Administrator",
    user: "Normaler Benutzer"
  },
  adminSettings: {
    apply: "Anwenden",
    guildIdPlaceholder: "Gilden-ID",
    selectServerTitle: "Wählen Sie einen Server:",
    selectWorldTitle: "Wählen Sie eine Welt:",
    close: "Schließen",
    defaultWorld: "Welt",
    guildNotFoundTitle: "Gilde nicht gefunden",
    guildNotFoundMessage: "Gilde mit der ID {{guildId}} wurde in der von Ihnen gewählten Welt auf diesem Server nicht gefunden.",
    ok: "OK",
    timeoutError: "Zeitüberschreitung."
  },
  userSettings: {
    requestAccessCode: "Fordern Sie den Zugangscode vom Gildenleiter an",
    accessCodePlaceholder: "Zugangscode",
    apply: "Übernehmen",
    userNotFoundTitle: "Benutzer nicht gefunden",
    userNotFoundMessage: "Versuchen Sie, ein anderes Passwort einzugeben",
    noGuildsTitle: "Keine Gilden",
    noGuildsMessage: "Der Benutzer ist in keiner Gilde",
    selectGuildTitle: "Wählen Sie eine Gilde:",
    close: "Schließen",
    ok: "OK"
  },
  chatStack: {
    chatScreenTitle: "Aultanka",
    guildMembersListTitle: "Neue Nachricht",
    newGroupChatTitle: "Gruppe erstellen",
    chatWindowTitle: "Чат"
  },
  gbStack: {
    gbScreenTitle: "Aufwertung Großartiger Bauwerke",
    newGBChatTitle: "Neuer Zweig der Aufwertung von GS",
    gbChatWindowTitle: "GBChatWindow",
    gbExpressTitle: "Express-Aufwertung",
    gbNewExpressTitle: "Express-Aufwertung"
  },
  quantStack: {
    quantScreenTitle: "Quanteninvasionen"
  },
  gbgStack: {
    gbgScreenTitle: "Gildenkampffeld"
  },
  gbgScreen: {
    mapTitles: {
      volcanic_archipelago: "Vulkanischer Archipel",
      waterfall_archipelago: "Wasserfall-Archipel"
    },
    loaderText: "Karte wird geladen...",
    listTitle: "Sektorenöffnungen",
    cacheButton: "Cache",
    bonusLabel: "Bonus: {{value}}{{time}}",
    attritionBonusLabel: "Bonus {{value}}%",
    bonusTimeRemaining: " ({{time}})",
    emptySchedule: "Keine Sektoren in Kürze",
    sectorNotifications: {
      muteTitle: "Nicht benachrichtigen",
      thirtyMinutes: "30 Minuten",
      oneHour: "1 Stunde",
      threeHours: "3 Stunden",
      fiveHours: "5 Stunden",
      untilEndOfDay: "Bis zum Tagesende",
      attackSectors: "Angriffssektoren (bis zum Tagesende)",
      defenseSectors: "Verteidigungssektoren (bis zum Tagesende)",
      untilEndOfSeason: "Bis zum Saisonende",
      saveFailed: "Benachrichtigungseinstellungen konnten nicht gespeichert werden."
    },
    info: {
      title: "Gegner auf der Karte",
      empty: "Keine Informationen verfügbar",
      close: "Schließen"
    },
    popup: {
      help: "Um Hilfe bitten"
    },
    help: {
      sendingTitle: "Senden...",
      sendingMessage: "Benachrichtigen alle Gildenmitglieder.",
      successTitle: "Erfolg!",
      successMessage: "Benachrichtigung gesendet."
    },
    errors: {
      title: "Fehler",
      guildNotFound: "Gilde konnte nicht ermittelt werden.",
      helpFailed: "Benachrichtigung konnte nicht gesendet werden. Bitte später erneut versuchen.",
      cacheReadFailed: "Cache konnte nicht gelesen werden."
    },
    cache: {
      title: "Widget-Cache",
      updatedAt: "updatedAt:",
      next5: "widget_gbg_next5:",
      mapState: "widget_gbg_map_state:",
      mapXml: "widget_gbg_map_xml:",
      close: "Schließen"
    }
  },
  profileStack: {
    profileMainTitle: "Profileinstellungen",
    profileDataTitle: "Profildaten",
    myGBTitle: "Meine Großartigen Bauwerke",
    addGBComponentTitle: "Fügen Sie GS zu Ihrer Liste hinzu",
    gbNewExpressTitle: "Express-Aufwertung",
    addScheduleTitle: "Aktivitätszeitpläne",
    sleepScheduleTitle: "Profildaten",
    languageSelectorTitle: "Sprache"
  },
  addSchedule: {
    header: "Benachrichtigungen aktivieren",
    description: "Du erhältst Benachrichtigungen zu den in den Zeitplänen angegebenen Zeiten",
    suggestedTitle: "Vorgeschlagene Bedingungen",
    activityTime: "Aktivitätszeit",
    emptyText: "Es sind noch keine Aktivitätszeitpläne gespeichert.",
    weeklyTitle: "Wöchentlicher Zeitplan",
    datesTitle: "Zeitplan nach Daten",
    noTimeSet: "Zeit nicht festgelegt",
    selectedDaysCount: "ausgewählte Tage: {{count}}",
    daysShort: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    deleteConfirmationTitle: "Zeitplan löschen",
    deleteConfirmationMessage: "Diesen Aktivitätszeitplan löschen?",
    cancel: "Abbrechen",
    delete: "Löschen"
  },
  customDrawer: {
    addWorld: "Welt hinzufügen",
    noName: "Ohne Namen"
  },
  drawer: {
    gbLabel: "GB-Zentrum",
    chatLabel: "Aultanka",
    quantLabel: "Quanteninvasionen",
    pbgLabel: "Gildenkampffeld",
    azbookLabel: "Alphabet",
    serviseLabel: "Dienste",
    profileLabel: "Profil",
    adminLabel: "Administratives Panel",
    culture: "Kulturelle Siedlungen"
  },
  gbScreen: {
    userIdError: "UserId konnte nicht abgerufen werden",
    guildIdError: "GuildId konnte nicht abgerufen werden",
    roleError: "Benutzerrolle konnte nicht abgerufen werden",
    loadUserDataError: "Fehler beim Laden der Benutzerdaten:",
    gbTitle: "Aufwertung Großartiger Bauwerke"
  },
  adminSelect: {
    title: "Wählen Sie Ihr Konto",
    emptyMessage: "Gilde nicht gefunden oder Daten fehlen",
    confirmationText: "Bestätigen Sie Ihr Konto?",
    confirmButton: "Bestätigen",
    cancelButton: "Abbrechen",
    accessCodeTitle: "Zugangscode speichern",
    accessCodeMessage: "Dieser Code wird für die Anmeldung nach einem Gerätewechsel oder einer Neuinstallation benötigt.",
    accessCodeLabel: "Ihr Zugangscode",
    copyAccessCode: "Code kopieren",
    accessCodeCopiedTitle: "Code kopiert",
    accessCodeCopiedMessage: "Bewahren Sie ihn an einem sicheren Ort auf.",
    copyAccessCodeError: "Der Zugangscode konnte nicht kopiert werden.",
    continueButton: "Weiter",
    creationErrorTitle: "Fehler",
    creationErrorMessage: "Das Konto konnte nicht erstellt werden. Versuchen Sie es erneut."
  },
  myGB: {
    asyncStorageError: "Guild ID oder User ID wurden in AsyncStorage nicht gefunden",
    deleteConfirmationTitle: "Bestätigung der Löschung",
    deleteConfirmationMessage: "Sind Sie sicher, dass Sie dieses Objekt löschen möchten?",
    cancel: "Abbrechen",
    delete: "Löschen",
    imageNotAvailable: "Image not available",
    levelLabel: "Level:",
    scheduleExpress: "Express planen",
    noBuilds: "No great builds available"
  },
  addGBComponent: {
    emptyMessage: "Keine verfügbaren GB zum Hinzufügen",
    addError: "Fehler beim Hinzufügen von GB"
  },
  newGBChat: {
    contributionRatioLabel: "Beitragskoeffizient:",
    contributionRatioLabelWithCoefficient: "Beitragskoeffizient: {{coefficient}}",
    allowedGBsLabel: "Erlaubte GB in der Gruppe:",
    selectGBPlaceholder: "Wählen Sie GB",
    levelThresholdLabel: "Mindestlevel GB:",
    guildMembersLabel: "Gildenmitglieder:",
    selectMembersPlaceholder: "Wählen Sie Mitglieder",
    placeLimitLabel: "Platzbeschränkung:",
    createChatButton: "Neuen Chat erstellen",
    selectAllOption: "Alles auswählen",
    guildIdNotFound: "Guild ID nicht gefunden",
    createChatError: "Fehler beim Erstellen des Chats:",
    fetchContributionError: "Fehler beim Abrufen der Daten von der API:",
    noGuildUsers: "Keine Gildenmitglieder",
    updateChatError: "Fehler beim Aktualisieren des Chats",
    chatNameLabel: "Chatname",
    chatNamePlaceholder: "Geben Sie den Chatnamen ein",
    guildMembersListTitle: "Mitgliederliste",
    guildMembersSelectTitle: "Mitgliederauswahl",
    placeLimitOptions: "Platzoptionen",
    guildMembersSelectAll: "Alle auswählen",
    updateChatButton: "Aktualisieren"
  },
  gbGuarant: {
    levelNotFound: "Level nicht gefunden",
    levelBaseNotFound: "levelBase nicht gefunden",
    levelLabel: "Level",
    myContribution: "Mein Beitrag",
    addContributorButton: "Beitragenden hinzufügen",
    contributorModalTitle: "Beitragender",
    selectContributorPlaceholder: "Wählen Sie einen Beitragenden...",
    contributionAmountTitle: "Beitragsgröße",
    contributionAmountPlaceholder: "Beitragsgröße",
    saveButton: "Speichern",
    cancelButton: "Abbrechen",
    fillAllFields: "Bitte füllen Sie alle Felder aus",
    optionStranger: "Fremder",
    optionFriend: "Freund"
  },
  gbChatWindow: {
    unknownBuild: "Unbekanntes GB",
    unknownUser: "Unbekannt",
    unknownLevel: "Unbekannter Level",
    noMessages: "Keine Nachrichten",
    userDataError: "Fehler beim Abrufen der Benutzerdaten:",
    messagesError: "Fehler beim Abrufen der Nachrichten:",
    buildingDataError: "Fehler beim Abrufen der Daten über GB:",
    buildingLevelError: "Fehler beim Abrufen des GB-Levels:",
    todayAt: "Heute um",
    yesterdayAt: "Gestern um",
    at: "um",
    placeSelectedTitle: "Platz gewählt",
    placeSelectedMessage: "Sie haben einen Platz gewählt",
    placeUpdateError: "Fehler beim Aktualisieren des Platzes oder excludedUser:",
    noPlaceValue: "Kein Platzwert",
    levelLabel: "Level"
  },
  gbPatrons: {
    column1: "Вкладник",
    column2: "Вкладено",
    column3: "Стоимость",
    column4: "До гаранту",
    column5: "Коэффициент",
    none: "Нет",
    leftColumnTitle: "Місце",
    guaranteed: "Гарантировано",
    stranger: "Чужинець",
    friend: "Друг",
    toLevelUp: "К прокачке",
    toLevelUpMsg: "Это место уже гарантировано. Вы можете занять его для прокачки!"
  },
  gbChatList: {
    noChats: "Keine verfügbaren Chats",
    chatGroup: "Aufwertung unter {{multiplier}}",
    fetchError: "Fehler beim Abrufen der Chats:",
    arcNotFound: "Daten zur Arkade nicht gefunden",
    arcFetchError: "Fehler beim Abrufen des Arkadenlevels:",
    express: "Express",
  },
  gbNewExpress: {
    selectBuilding: "GB für Express",
    selectBuildingPlaceholder: "Wählen Sie ein GB",
    authError: "GuildId oder UserId nicht gefunden in AsyncStorage",
    noData: "Daten nicht gefunden",
    fetchError: "Fehler beim Abrufen der Daten von Firebase:",
    levelThresholdLabel: "Ungefähre Anzahl der Levels",
    placeLimitLabel: "Mögliche Plätze für \"Kleinkinder\"",
    scheduleTime: "Zeit planen",
    setTime: "Zeit festlegen",
    modalTitle: "Planen",
    saveButton: "Speichern",
    today: "Heute",
    tomorrow: "Morgen",
    specify: "Zeit angeben",
    loadingBuildingInfo: "Lade Daten..."
  },
  dates: {
    days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    months: [
      "Januar", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember"
    ]
  },
  datesShort: {
    days: ["nd", "mo", "di", "mi", "do", "fr", "sa"],
    months: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
  },
  adminStack: {
    adminScreenTitle: "Gildeneinstellungen"
  },
  guildAdmin: {
    telegram: {
      title: "Telegram-Benachrichtigungen",
      description: "Verbinden Sie Ihren eigenen Kanal ohne Bot-Token oder Chat-ID. Benachrichtigungen gelten nur für die aktive Gilde.",
      loading: "Wird geladen...",
      disconnected: "Es ist noch kein Telegram-Kanal verbunden.",
      connected: "Telegram ist verbunden",
      channelFallback: "Telegram-Kanal",
      connect: "Telegram verbinden",
      reconnect: "Erneut verbinden",
      stepCreateChannel: "Erstellen oder wählen Sie einen Kanal in Telegram.",
      stepAddBot: "Fügen Sie den gemeinsamen App-Bot als Administrator mit Veröffentlichungsrecht zum Kanal hinzu.",
      stepPublishCommand: "Veröffentlichen Sie den folgenden Befehl direkt in diesem Kanal.",
      botLabel: "Bot",
      addBot: "Bot zum Kanal hinzufügen",
      commandLabel: "Zu veröffentlichender Befehl",
      copiedTitle: "Kopiert",
      copiedMessage: "Der Befehl wurde in die Zwischenablage kopiert.",
      waiting: "Warten auf die Bestätigung von Telegram…",
      expiresIn: "Code ist noch {{time}} gültig",
      codeExpired: "Der Code ist abgelaufen. Erstellen Sie einen neuen Code.",
      newCode: "Neuen Code erstellen",
      pendingCodeLost: "Für diese Gilde wurde bereits ein Code erstellt. Aus Sicherheitsgründen wird er nicht im Klartext gespeichert — erstellen Sie einen neuen.",
      test: "Test senden",
      testSentTitle: "Telegram",
      testSentMessage: "Die Testnachricht wurde an den Kanal gesendet.",
      testFailed: "Die Testnachricht konnte nicht gesendet werden.",
      disconnect: "Trennen",
      disconnectTitle: "Telegram trennen?",
      disconnectMessage: "Benachrichtigungen dieser Gilde werden nicht mehr an den verbundenen Kanal gesendet.",
      cancel: "Abbrechen",
      disconnectConfirm: "Trennen",
      disconnectedTitle: "Telegram getrennt",
      disconnectedMessage: "Der Kanal ist nicht mehr mit dieser Gilde verbunden. Entfernen Sie den Bot bei Bedarf in Telegram.",
      disconnectFailed: "Telegram konnte nicht getrennt werden.",
      setupFailed: "Der Verbindungscode konnte nicht erstellt werden.",
      errorTitle: "Fehler",
      permissionDenied: "Nur ein Administrator, Tester oder Entwickler dieser Gilde kann Telegram verbinden.",
      botNotConfigured: "Der gemeinsame Telegram-Bot wurde vom App-Entwickler noch nicht eingerichtet.",
      webhookUnavailable: "Die Telegram-Webhook-Adresse konnte nach dem Deployment nicht ermittelt werden.",
      botNotAdmin: "Der Bot ist kein Administrator oder darf in diesem Kanal nicht veröffentlichen.",
      alreadyBound: "Dieser Telegram-Kanal ist bereits mit einer anderen Gilde verbunden.",
      wrongBot: "Der Befehl ist an einen anderen Telegram-Bot gerichtet.",
      connectionLost: "Der Bot hat keinen Zugriff oder kein Veröffentlichungsrecht mehr.",
      connectionError: "Die Telegram-Verbindung muss wiederhergestellt werden",
      bindingBusy: "Die Verknüpfung wird bereits verarbeitet. Warten Sie einige Sekunden.",
      tooSoon: "Warten Sie {{seconds}} Sek. und versuchen Sie es erneut.",
      telegramUnavailable: "Telegram ist vorübergehend nicht verfügbar. Versuchen Sie es später erneut.",
      openBotFailed: "Telegram konnte nicht geöffnet werden.",
      genericError: "Die Aktion ist fehlgeschlagen. Prüfen Sie die Internetverbindung und versuchen Sie es erneut."
    }
  },
  chatList: {
    title: "Nachrichten",
    privateLabel: "Privater Chat",
    groupLabel: "Gruppenchat",
    emptyTitle: "Keine verfügbaren Chats",
    emptySubtitle: "Starten Sie jetzt ein neues Gespräch"
  },
  chatScreen: {
    listenError: "Fehler beim Anhören des Chats"
  }
};

const enOverrides = {
  welcome: "Welcome",
  server: "Server",
  cultureResources: {
    fish: "fish",
    spice: "spice",
    rum: "rum",
    cannons: "cannons",
    doubloons: "doubloons"
  },
  roleSelection: {
    title: "Choose a role:",
    admin: "Administrator",
    user: "Regular user"
  },
  adminSelect: {
    accessCodeTitle: "Save your access code",
    accessCodeMessage: "You will need this code to sign in after changing or reinstalling your phone.",
    accessCodeLabel: "Your access code",
    copyAccessCode: "Copy code",
    accessCodeCopiedTitle: "Code copied",
    accessCodeCopiedMessage: "Keep it in a safe place.",
    copyAccessCodeError: "Could not copy the access code.",
    continueButton: "Continue",
    creationErrorTitle: "Error",
    creationErrorMessage: "Could not create the account. Try again."
  },
  adminSettings: {
    apply: "Apply",
    guildIdPlaceholder: "Guild ID",
    selectServerTitle: "Select a server:",
    selectWorldTitle: "Select a world:",
    close: "Close",
    defaultWorld: "World",
    guildNotFoundTitle: "Guild not found",
    guildNotFoundMessage: "Guild with ID {{guildId}} was not found in the selected world on this server.",
    timeoutError: "Request timed out"
  },
  guildAdmin: {
    telegram: {
      title: "Telegram notifications",
      description: "Connect your own channel without a Bot Token or Chat ID. Notifications will be sent only for the active guild.",
      loading: "Loading...",
      disconnected: "No Telegram channel is connected yet.",
      connected: "Telegram connected",
      channelFallback: "Telegram channel",
      connect: "Connect Telegram",
      reconnect: "Connect again",
      stepCreateChannel: "Create or select a channel in Telegram.",
      stepAddBot: "Add the app's shared bot to the channel as an administrator with permission to post messages.",
      stepPublishCommand: "Publish the command below directly in that channel.",
      botLabel: "Bot",
      addBot: "Add bot to channel",
      commandLabel: "Command to publish",
      copiedTitle: "Copied",
      copiedMessage: "The command was copied to the clipboard.",
      waiting: "Waiting for Telegram confirmation…",
      expiresIn: "Code expires in {{time}}",
      codeExpired: "The code has expired. Create a new code.",
      newCode: "Create a new code",
      pendingCodeLost: "A code was already created for this guild. It is not stored in plain text for security reasons — create a new one.",
      test: "Send test",
      testSentTitle: "Telegram",
      testSentMessage: "A test message was sent to the channel.",
      testFailed: "Could not send the test message.",
      disconnect: "Disconnect",
      disconnectTitle: "Disconnect Telegram?",
      disconnectMessage: "Notifications for this guild will no longer be sent to the connected channel.",
      cancel: "Cancel",
      disconnectConfirm: "Disconnect",
      disconnectedTitle: "Telegram disconnected",
      disconnectedMessage: "The channel is no longer linked to this guild. Remove the bot from the channel in Telegram if needed.",
      disconnectFailed: "Could not disconnect Telegram.",
      setupFailed: "Could not create a connection code.",
      errorTitle: "Error",
      permissionDenied: "Only an administrator, tester, or developer of this guild can connect Telegram.",
      botNotConfigured: "The app's shared Telegram bot has not been configured by the developer yet.",
      webhookUnavailable: "The Telegram webhook address could not be determined after deploying the functions.",
      botNotAdmin: "The bot is not an administrator or cannot post messages in this channel.",
      alreadyBound: "This Telegram channel is already linked to another guild.",
      wrongBot: "The command is addressed to a different Telegram bot.",
      connectionLost: "The bot no longer has access to the channel or permission to post.",
      connectionError: "The Telegram connection needs attention",
      bindingBusy: "The binding is already being processed. Wait a few seconds.",
      tooSoon: "Wait {{seconds}} seconds and try again.",
      telegramUnavailable: "Telegram is temporarily unavailable. Try again later.",
      openBotFailed: "Could not open Telegram.",
      genericError: "The action failed. Check your internet connection and try again."
    }
  },
  userSettings: {
    requestAccessCode: "Ask the guild leader for the access code",
    accessCodePlaceholder: "Access code",
    apply: "Apply",
    userNotFoundTitle: "User not found",
    userNotFoundMessage: "Try another password",
    noGuildsTitle: "No guilds",
    noGuildsMessage: "The user is not in any guild",
    selectGuildTitle: "Choose a guild:",
    close: "Close"
  },
  chatStack: {
    chatScreenTitle: "Chat",
    guildMembersListTitle: "New message",
    newGroupChatTitle: "Create group",
    chatWindowTitle: "Chat"
  },
  gbStack: {
    gbScreenTitle: "Great Buildings leveling",
    newGBChatTitle: "New GB branch",
    gbChatWindowTitle: "GB chat",
    gbExpressTitle: "Express leveling",
    gbNewExpressTitle: "Express leveling"
  },
  quantStack: {
    quantScreenTitle: "Quantum incursions"
  },
  gbgStack: {
    gbgScreenTitle: "Guild battlegrounds"
  },
  gbgScreen: {
    mapTitles: {
      volcanic_archipelago: "Volcanic Archipelago",
      waterfall_archipelago: "Waterfall Archipelago"
    },
    loaderText: "Loading map...",
    listTitle: "Sector openings",
    cacheButton: "Cache",
    bonusLabel: "Bonus: {{value}}{{time}}",
    attritionBonusLabel: "Bonus {{value}}%",
    bonusTimeRemaining: " ({{time}})",
    emptySchedule: "No sectors expected soon",
    sectorNotifications: {
      muteTitle: "Do not notify",
      thirtyMinutes: "30 minutes",
      oneHour: "1 hour",
      threeHours: "3 hours",
      fiveHours: "5 hours",
      untilEndOfDay: "Until end of day",
      attackSectors: "Attack sectors (until end of day)",
      defenseSectors: "Defense sectors (until end of day)",
      untilEndOfSeason: "Until end of season",
      saveFailed: "Could not save notification settings."
    },
    info: {
      title: "Opponents on the map",
      empty: "No information available",
      close: "Close"
    },
    popup: {
      help: "Request help"
    },
    help: {
      sendingTitle: "Sending...",
      sendingMessage: "Notifying all guild members.",
      successTitle: "Success!",
      successMessage: "Notification sent."
    },
    errors: {
      title: "Error",
      guildNotFound: "Could not determine guild.",
      helpFailed: "Could not send notification. Please try again later.",
      cacheReadFailed: "Could not read cache."
    },
    cache: {
      title: "Widget cache",
      updatedAt: "updatedAt:",
      next5: "widget_gbg_next5:",
      mapState: "widget_gbg_map_state:",
      mapXml: "widget_gbg_map_xml:",
      close: "Close"
    }
  },
  profileStack: {
    profileMainTitle: "Profile settings",
    profileDataTitle: "Profile data",
    myGBTitle: "My Great Buildings",
    addGBComponentTitle: "Add a GB to your list",
    gbNewExpressTitle: "Express leveling",
    addScheduleTitle: "Activity schedules",
    sleepScheduleTitle: "Profile data",
    languageSelectorTitle: "Language"
  },
  addSchedule: {
    header: "Enable notifications",
    description: "You will receive notifications at the times specified in the schedules",
    suggestedTitle: "Suggested conditions",
    activityTime: "Activity time",
    emptyText: "No activity schedules saved yet.",
    weeklyTitle: "Weekly schedule",
    datesTitle: "Schedule by dates",
    noTimeSet: "Time not set",
    selectedDaysCount: "selected days: {{count}}",
    daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    deleteConfirmationTitle: "Delete schedule",
    deleteConfirmationMessage: "Delete this activity schedule?",
    cancel: "Cancel",
    delete: "Delete"
  },
  customDrawer: {
    addWorld: "Add world",
    noName: "No name"
  },
  drawer: {
    gbLabel: "GB Center",
    chatLabel: "Chat",
    quantLabel: "Quantum incursions",
    pbgLabel: "Guild battlegrounds",
    azbookLabel: "Alphabet",
    serviseLabel: "Services",
    profileLabel: "Profile",
    adminLabel: "Admin panel",
    culture: "Cultural settlements"
  },
  chatList: {
    title: "Messages",
    privateLabel: "Private chat",
    groupLabel: "Group chat",
    emptyTitle: "No chats available",
    emptySubtitle: "Start a new conversation now"
  },
  chatScreen: {
    listenError: "Chat listener error"
  }
};

const plOverrides = {
  welcome: "Witamy",
  server: "Serwer",
  cultureResources: {
    fish: "ryby",
    spice: "przyprawy",
    rum: "rum",
    cannons: "armaty",
    doubloons: "dublony"
  },
  roleSelection: {
    title: "Wybierz rolę:",
    admin: "Administrator",
    user: "Zwykły użytkownik"
  },
  adminSelect: {
    accessCodeTitle: "Zapisz kod dostępu",
    accessCodeMessage: "Ten kod będzie potrzebny do logowania po zmianie lub ponownej instalacji telefonu.",
    accessCodeLabel: "Twój kod dostępu",
    copyAccessCode: "Kopiuj kod",
    accessCodeCopiedTitle: "Kod skopiowany",
    accessCodeCopiedMessage: "Zachowaj go w bezpiecznym miejscu.",
    copyAccessCodeError: "Nie udało się skopiować kodu dostępu.",
    continueButton: "Kontynuuj",
    creationErrorTitle: "Błąd",
    creationErrorMessage: "Nie udało się utworzyć konta. Spróbuj ponownie."
  },
  adminSettings: {
    apply: "Zastosuj",
    guildIdPlaceholder: "ID gildii",
    selectServerTitle: "Wybierz serwer:",
    selectWorldTitle: "Wybierz świat:",
    close: "Zamknij",
    defaultWorld: "Świat",
    guildNotFoundTitle: "Nie znaleziono gildii",
    guildNotFoundMessage: "Gildia z ID {{guildId}} nie została znaleziona w wybranym świecie na tym serwerze.",
    timeoutError: "Przekroczono czas oczekiwania"
  },
  guildAdmin: {
    telegram: {
      title: "Powiadomienia Telegram",
      description: "Połącz własny kanał bez Bot Tokena ani Chat ID. Powiadomienia będą dotyczyć tylko aktywnej gildii.",
      loading: "Ładowanie...",
      disconnected: "Kanał Telegram nie jest jeszcze połączony.",
      connected: "Telegram połączony",
      channelFallback: "Kanał Telegram",
      connect: "Połącz Telegram",
      reconnect: "Połącz ponownie",
      stepCreateChannel: "Utwórz lub wybierz kanał w Telegramie.",
      stepAddBot: "Dodaj wspólnego bota aplikacji do kanału jako administratora z prawem publikowania wiadomości.",
      stepPublishCommand: "Opublikuj poniższe polecenie bezpośrednio na tym kanale.",
      botLabel: "Bot",
      addBot: "Dodaj bota do kanału",
      commandLabel: "Polecenie do opublikowania",
      copiedTitle: "Skopiowano",
      copiedMessage: "Polecenie skopiowano do schowka.",
      waiting: "Oczekiwanie na potwierdzenie Telegrama…",
      expiresIn: "Kod jest ważny jeszcze {{time}}",
      codeExpired: "Kod wygasł. Utwórz nowy kod.",
      newCode: "Utwórz nowy kod",
      pendingCodeLost: "Kod dla tej gildii został już utworzony. Ze względów bezpieczeństwa nie jest przechowywany jawnie — utwórz nowy.",
      test: "Wyślij test",
      testSentTitle: "Telegram",
      testSentMessage: "Wiadomość testowa została wysłana na kanał.",
      testFailed: "Nie udało się wysłać wiadomości testowej.",
      disconnect: "Odłącz",
      disconnectTitle: "Odłączyć Telegram?",
      disconnectMessage: "Powiadomienia tej gildii nie będą już wysyłane na połączony kanał.",
      cancel: "Anuluj",
      disconnectConfirm: "Odłącz",
      disconnectedTitle: "Telegram odłączony",
      disconnectedMessage: "Kanał nie jest już połączony z tą gildią. W razie potrzeby usuń bota z kanału w Telegramie.",
      disconnectFailed: "Nie udało się odłączyć Telegrama.",
      setupFailed: "Nie udało się utworzyć kodu połączenia.",
      errorTitle: "Błąd",
      permissionDenied: "Tylko administrator, tester lub programista tej gildii może połączyć Telegram.",
      botNotConfigured: "Wspólny bot Telegram nie został jeszcze skonfigurowany przez twórcę aplikacji.",
      webhookUnavailable: "Nie udało się ustalić adresu webhooka Telegram po wdrożeniu funkcji.",
      botNotAdmin: "Bot nie jest administratorem lub nie może publikować wiadomości na tym kanale.",
      alreadyBound: "Ten kanał Telegram jest już połączony z inną gildią.",
      wrongBot: "Polecenie jest skierowane do innego bota Telegram.",
      connectionLost: "Bot nie ma już dostępu do kanału lub prawa publikowania.",
      connectionError: "Połączenie z Telegramem wymaga naprawy",
      bindingBusy: "Powiązanie jest już przetwarzane. Poczekaj kilka sekund.",
      tooSoon: "Poczekaj {{seconds}} s i spróbuj ponownie.",
      telegramUnavailable: "Telegram jest tymczasowo niedostępny. Spróbuj później.",
      openBotFailed: "Nie udało się otworzyć Telegrama.",
      genericError: "Nie udało się wykonać działania. Sprawdź internet i spróbuj ponownie."
    }
  },
  userSettings: {
    requestAccessCode: "Poproś lidera gildii o kod dostępu",
    accessCodePlaceholder: "Kod dostępu",
    apply: "Zatwierdź",
    userNotFoundTitle: "Nie znaleziono użytkownika",
    userNotFoundMessage: "Spróbuj innego hasła",
    noGuildsTitle: "Brak gildii",
    noGuildsMessage: "Użytkownik nie należy do żadnej gildii",
    selectGuildTitle: "Wybierz gildię:",
    close: "Zamknij"
  },
  chatStack: {
    chatScreenTitle: "Czat",
    guildMembersListTitle: "Nowa wiadomość",
    newGroupChatTitle: "Utwórz grupę",
    chatWindowTitle: "Czat"
  },
  gbStack: {
    gbScreenTitle: "Rozwój Wielkich Budowli",
    newGBChatTitle: "Nowa gałąź WB",
    gbChatWindowTitle: "Czat WB",
    gbExpressTitle: "Ekspresowe ulepszanie",
    gbNewExpressTitle: "Ekspresowe ulepszanie"
  },
  quantStack: {
    quantScreenTitle: "Najazdy kwantowe"
  },
  gbgStack: {
    gbgScreenTitle: "Pola bitew gildii"
  },
  gbgScreen: {
    mapTitles: {
      volcanic_archipelago: "Archipel Wulkaniczny",
      waterfall_archipelago: "Archipel Wodospadów"
    },
    loaderText: "Ładowanie mapy...",
    listTitle: "Otwarcia sektorów",
    cacheButton: "Pamięć podręczna",
    bonusLabel: "Premia: {{value}}{{time}}",
    attritionBonusLabel: "Premia {{value}}%",
    bonusTimeRemaining: " ({{time}})",
    emptySchedule: "W najbliższym czasie brak sektorów",
    sectorNotifications: {
      muteTitle: "Nie powiadamiaj",
      thirtyMinutes: "30 minut",
      oneHour: "1 godzina",
      threeHours: "3 godziny",
      fiveHours: "5 godzin",
      untilEndOfDay: "Do końca dnia",
      attackSectors: "Sektory ataku (do końca dnia)",
      defenseSectors: "Sektory obrony (do końca dnia)",
      untilEndOfSeason: "Do końca sezonu",
      saveFailed: "Nie udało się zapisać ustawień powiadomień."
    },
    info: {
      title: "Przeciwnicy na mapie",
      empty: "Brak informacji",
      close: "Zamknij"
    },
    popup: {
      help: "Wezwij pomoc"
    },
    help: {
      sendingTitle: "Wysyłanie...",
      sendingMessage: "Powiadamiamy wszystkich członków gildii.",
      successTitle: "Sukces!",
      successMessage: "Powiadomienie wysłane."
    },
    errors: {
      title: "Błąd",
      guildNotFound: "Nie udało się ustalić gildii.",
      helpFailed: "Nie udało się wysłać powiadomienia. Spróbuj ponownie później.",
      cacheReadFailed: "Nie udało się odczytać pamięci podręcznej."
    },
    cache: {
      title: "Pamięć podręczna widżetu",
      updatedAt: "updatedAt:",
      next5: "widget_gbg_next5:",
      mapState: "widget_gbg_map_state:",
      mapXml: "widget_gbg_map_xml:",
      close: "Zamknij"
    }
  },
  profileStack: {
    profileMainTitle: "Ustawienia profilu",
    profileDataTitle: "Dane profilu",
    myGBTitle: "Moje Wielkie Budowle",
    addGBComponentTitle: "Dodaj WB do listy",
    gbNewExpressTitle: "Ekspresowe ulepszanie",
    addScheduleTitle: "Dane profilu",
    sleepScheduleTitle: "Dane profilu",
    languageSelectorTitle: "Język"
  },
  customDrawer: {
    addWorld: "Dodaj świat",
    noName: "Bez nazwy"
  },
  drawer: {
    gbLabel: "Centrum WB",
    chatLabel: "Czat",
    quantLabel: "Najazdy kwantowe",
    pbgLabel: "Pola bitew gildii",
    azbookLabel: "Alfabet",
    serviseLabel: "Usługi",
    profileLabel: "Profil",
    adminLabel: "Panel administracyjny",
    culture: "Osady kulturowe"
  },
  chatList: {
    title: "Wiadomości",
    privateLabel: "Czat prywatny",
    groupLabel: "Czat grupowy",
    emptyTitle: "Brak dostępnych czatów",
    emptySubtitle: "Rozpocznij nową rozmowę już teraz"
  },
  chatScreen: {
    listenError: "Błąd nasłuchiwania czatu"
  }
};

const guaranteeTranslations = {
  uk: {
    title: "Гаранти", level: "Рівень {{level}}", chat: "Чат", allProtected: "Усі поточні місця захищені",
    filters: { ready: "Доступні", all_protected: "Гарантоване" },
    statusFilters: { all: "Усі статуси", take_place: "Гарантовано", owner_deposit: "Внесок власника", guild_member_top_up: "Докинути", new_guild_member_deposit: "Перебити" },
    placeFilters: { all: "Усі місця", "1-2": "1–2 місця", "3-5": "3–5 місця" },
    status: { protected: "Гарантоване", takePlace: "Можна зайти", ownerDeposit: "Потрібен внесок власника", topUp: "Потрібно докинути", overtake: "Можна перебити", action: "Потрібна дія" },
    labels: { place: "Місце", guaranteedPlace: "Гарантоване місце", multiplier: "Коефіцієнт вкладу", contributionSize: "Розмір вкладу", updated: "Оновлено", branch: "Гілка", rate: "Ставка", remaining: "Залишок до закриття", nextAction: "Наступна дія", amount: "Сума", target: "Підсумковий вклад", arc: "Арка від" },
    actions: { takePlace: "Можна зайти на місце", ownerDeposit: "Власнику потрібно внести", topUp: "Потрібно докинути вкладнику", newDeposit: "Новому вкладнику потрібно внести" },
    freshness: { now: "щойно", minutes: "{{count}} хв тому", hours: "{{count}} год тому", days: "{{count}} дн тому" },
    empty: { ready: "Немає доступних гарантів", protected: "Немає гарантованих ВС", filtered: "Нічого не знайдено для цього фільтра" },
    loadError: "Не вдалося завантажити гаранти", retry: "Повторити", refreshAll: "Оновити всі ВС", refreshErrorTitle: "Помилка оновлення", refreshError: "Не вдалося оновити всі ВС гільдії",
  },
  ru: {
    title: "Гаранты", level: "Уровень {{level}}", chat: "Чат", allProtected: "Все текущие места защищены",
    filters: { ready: "Доступные", all_protected: "Обеспечено" }, placeFilters: { all: "Все места", "1-2": "1–2 места", "3-5": "3–5 места" },
    statusFilters: { all: "Все статусы", take_place: "Гарантировано", owner_deposit: "Вклад владельца", guild_member_top_up: "Добавить", new_guild_member_deposit: "Перебить" },
    status: { protected: "Гарант обеспечен", takePlace: "Можно войти", ownerDeposit: "Нужен вклад владельца", topUp: "Нужно добавить", overtake: "Можно перебить", action: "Нужно действие" },
    labels: { place: "Место", guaranteedPlace: "Гарантированное место", multiplier: "Коэффициент вклада", contributionSize: "Размер вклада", updated: "Обновлено", branch: "Ветка", rate: "Ставка", remaining: "Осталось до закрытия", nextAction: "Следующее действие", amount: "Сумма", target: "Итоговый вклад", arc: "Арка от" },
    actions: { takePlace: "Можно занять место", ownerDeposit: "Владельцу нужно внести", topUp: "Нужно добавить вкладчику", newDeposit: "Новому вкладчику нужно внести" },
    freshness: { now: "только что", minutes: "{{count}} мин назад", hours: "{{count}} ч назад", days: "{{count}} дн назад" },
    empty: { ready: "Нет доступных гарантов", protected: "Нет обеспеченных гарантов", filtered: "Для этого фильтра ничего не найдено" }, loadError: "Не удалось загрузить гаранты", retry: "Повторить", refreshAll: "Обновить все ВС", refreshErrorTitle: "Ошибка обновления", refreshError: "Не удалось обновить все ВС гильдии",
  },
  be: {
    title: "Гаранты", level: "Узровень {{level}}", chat: "Чат", allProtected: "Усе бягучыя месцы абаронены",
    filters: { ready: "Даступныя", all_protected: "Забяспечана" }, placeFilters: { all: "Усе месцы", "1-2": "1–2 месцы", "3-5": "3–5 месцы" },
    statusFilters: { all: "Усе статусы", take_place: "Гарантавана", owner_deposit: "Унёсак уладальніка", guild_member_top_up: "Дадаць", new_guild_member_deposit: "Перабіць" },
    status: { protected: "Гарант забяспечаны", takePlace: "Можна ўвайсці", ownerDeposit: "Патрэбны ўклад уладальніка", topUp: "Трэба дадаць", overtake: "Можна перабіць", action: "Патрэбна дзеянне" },
    labels: { place: "Месца", guaranteedPlace: "Гарантаванае месца", multiplier: "Каэфіцыент унёску", contributionSize: "Памер унёску", updated: "Абноўлена", branch: "Галіна", rate: "Стаўка", remaining: "Засталося да закрыцця", nextAction: "Наступнае дзеянне", amount: "Сума", target: "Выніковы ўклад", arc: "Арка ад" },
    actions: { takePlace: "Можна заняць месца", ownerDeposit: "Уладальніку трэба ўнесці", topUp: "Трэба дадаць укладчыку", newDeposit: "Новаму ўкладчыку трэба ўнесці" },
    freshness: { now: "толькі што", minutes: "{{count}} хв таму", hours: "{{count}} г таму", days: "{{count}} дз таму" },
    empty: { ready: "Няма даступных гарантаў", protected: "Няма забяспечаных гарантаў", filtered: "Для гэтага фільтра нічога не знойдзена" }, loadError: "Не ўдалося загрузіць гаранты", retry: "Паўтарыць", refreshAll: "Абнавіць усе ВС", refreshErrorTitle: "Памылка абнаўлення", refreshError: "Не ўдалося абнавіць усе ВС гільдыі",
  },
  de: {
    title: "Garantien", level: "Stufe {{level}}", chat: "Chat", allProtected: "Alle aktuellen Plätze sind geschützt",
    filters: { ready: "Verfügbar", all_protected: "Gesichert" }, placeFilters: { all: "Alle Plätze", "1-2": "Plätze 1–2", "3-5": "Plätze 3–5" },
    statusFilters: { all: "Alle Status", take_place: "Garantiert", owner_deposit: "Eigentümerbeitrag", guild_member_top_up: "Aufstocken", new_guild_member_deposit: "Überbieten" },
    status: { protected: "Garantie gesichert", takePlace: "Platz verfügbar", ownerDeposit: "Eigentümerbeitrag nötig", topUp: "Aufstockung nötig", overtake: "Überbieten möglich", action: "Aktion nötig" },
    labels: { place: "Platz", guaranteedPlace: "Garantierter Platz", multiplier: "Beitragsfaktor", contributionSize: "Beitragshöhe", updated: "Aktualisiert", branch: "Zweig", rate: "Beitrag", remaining: "Bis zum Abschluss", nextAction: "Nächste Aktion", amount: "Betrag", target: "Zielbeitrag", arc: "Arche ab" },
    actions: { takePlace: "Platz kann belegt werden", ownerDeposit: "Eigentümer muss einzahlen", topUp: "Beitrag muss aufgestockt werden", newDeposit: "Neues Mitglied muss einzahlen" },
    freshness: { now: "gerade eben", minutes: "vor {{count}} Min.", hours: "vor {{count}} Std.", days: "vor {{count}} Tagen" },
    empty: { ready: "Keine verfügbaren Garantien", protected: "Keine gesicherten Garantien", filtered: "Keine Treffer für diesen Filter" }, loadError: "Garantien konnten nicht geladen werden", retry: "Erneut versuchen", refreshAll: "Alle GB aktualisieren", refreshErrorTitle: "Aktualisierungsfehler", refreshError: "Die GB der Gilde konnten nicht aktualisiert werden",
  },
  en: {
    title: "Guarantees", level: "Level {{level}}", chat: "Chat", allProtected: "All current places are protected",
    filters: { ready: "Available", all_protected: "Protected" }, placeFilters: { all: "All places", "1-2": "Places 1–2", "3-5": "Places 3–5" },
    statusFilters: { all: "All statuses", take_place: "Guaranteed", owner_deposit: "Owner deposit", guild_member_top_up: "Top up", new_guild_member_deposit: "Overtake" },
    status: { protected: "Guarantee secured", takePlace: "Ready to enter", ownerDeposit: "Owner deposit needed", topUp: "Top-up needed", overtake: "Can overtake", action: "Action needed" },
    labels: { place: "Place", guaranteedPlace: "Guaranteed place", multiplier: "Contribution multiplier", contributionSize: "Contribution size", updated: "Updated", branch: "Branch", rate: "Contribution", remaining: "Remaining to close", nextAction: "Next action", amount: "Amount", target: "Target contribution", arc: "Arc from" },
    actions: { takePlace: "A member can take the place", ownerDeposit: "The owner needs to contribute", topUp: "The contributor needs to top up", newDeposit: "A new contributor needs to contribute" },
    freshness: { now: "just now", minutes: "{{count}} min ago", hours: "{{count}} hr ago", days: "{{count}} days ago" },
    empty: { ready: "No available guarantees", protected: "No protected guarantees", filtered: "Nothing found for this filter" }, loadError: "Could not load guarantees", retry: "Retry", refreshAll: "Refresh all GBs", refreshErrorTitle: "Refresh failed", refreshError: "Could not refresh all guild GBs",
  },
  pl: {
    title: "Gwarancje", level: "Poziom {{level}}", chat: "Czat", allProtected: "Wszystkie obecne miejsca są chronione",
    filters: { ready: "Dostępne", all_protected: "Zabezpieczone" }, placeFilters: { all: "Wszystkie miejsca", "1-2": "Miejsca 1–2", "3-5": "Miejsca 3–5" },
    statusFilters: { all: "Wszystkie statusy", take_place: "Gwarantowane", owner_deposit: "Wkład właściciela", guild_member_top_up: "Dopłata", new_guild_member_deposit: "Przebicie" },
    status: { protected: "Gwarancja zabezpieczona", takePlace: "Można wejść", ownerDeposit: "Potrzebny wkład właściciela", topUp: "Potrzebna dopłata", overtake: "Można przebić", action: "Wymagane działanie" },
    labels: { place: "Miejsce", guaranteedPlace: "Gwarantowane miejsce", multiplier: "Mnożnik wkładu", contributionSize: "Wielkość wkładu", updated: "Zaktualizowano", branch: "Wątek", rate: "Wkład", remaining: "Do zamknięcia", nextAction: "Następne działanie", amount: "Kwota", target: "Docelowy wkład", arc: "Arka od" },
    actions: { takePlace: "Można zająć miejsce", ownerDeposit: "Właściciel musi wpłacić", topUp: "Wkładca musi dopłacić", newDeposit: "Nowy wkładca musi wpłacić" },
    freshness: { now: "przed chwilą", minutes: "{{count}} min temu", hours: "{{count}} godz. temu", days: "{{count}} dni temu" },
    empty: { ready: "Brak dostępnych gwarancji", protected: "Brak zabezpieczonych gwarancji", filtered: "Brak wyników dla tego filtra" }, loadError: "Nie udało się wczytać gwarancji", retry: "Ponów", refreshAll: "Odśwież wszystkie WB", refreshErrorTitle: "Błąd odświeżania", refreshError: "Nie udało się odświeżyć wszystkich WB gildii",
  },
};

ukTranslation.gbGuarantees = guaranteeTranslations.uk;
ruTranslation.gbGuarantees = guaranteeTranslations.ru;
beTranslation.gbGuarantees = guaranteeTranslations.be;
deTranslation.gbGuarantees = guaranteeTranslations.de;

const enTranslation = deepMerge(deepMerge(ukTranslation, enOverrides), {
  gbGuarantees: guaranteeTranslations.en,
});
const plTranslation = deepMerge(deepMerge(ukTranslation, plOverrides), {
  gbGuarantees: guaranteeTranslations.pl,
});

const resources = {
  uk: { translation: ukTranslation },
  ru: { translation: ruTranslation },
  be: { translation: beTranslation },
  de: { translation: deTranslation },
  en: { translation: enTranslation },
  pl: { translation: plTranslation },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "uk",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
