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
    gbNewExpressTitle: "Експрес прокачка1"
  },
  quantStack: {
    quantScreenTitle: "Квантові вторгнення"
  },
  gbgStack: {
    gbgScreenTitle: "Поле битви гільдій"
  },
  profileStack: {
    profileMainTitle: "Налаштування профілю",
    profileDataTitle: "Дані профілю",
    myGBTitle: "Мої Величні Споруди",
    addGBComponentTitle: "Додайте ВС до свого списку",
    gbNewExpressTitle: "Експрес прокачка1",
    addScheduleTitle: "Дані профілю",
    sleepScheduleTitle: "Дані профілю",
    languageSelectorTitle: "Мова"
  },
  customDrawer: {
    addWorld: "Додати світ",
    noName: "Без назви"
  },
  drawer: {
    gbLabel: "Величні споруди",
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
    cancelButton: "Відміна"
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
    contributionRatioLabel: "Коефіцієнт внеску (nodeRatio):",
    contributionRatioLabelWithCoefficient: "Коефіцієнт внеску (nodeRatio): (коефіцієнт {{coefficient}})",
    allowedGBsLabel: "Дозволені в гілці ВС (allowedGBs):",
    selectGBPlaceholder: "Оберіть ВС",
    levelThresholdLabel: "Мінімальний рівень ВС (levelThreshold):",
    guildMembersLabel: "Учасники гільдії:",
    selectMembersPlaceholder: "Оберіть учасників",
    placeLimitLabel: "Обмеження місць (placeLimit):",
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
    gbNewExpressTitle: "Экспресс прокачка1"
  },
  quantStack: {
    quantScreenTitle: "Квантовые вторжения"
  },
  gbgStack: {
    gbgScreenTitle: "Поле битвы гильдий"
  },
  profileStack: {
    profileMainTitle: "Настройка профиля",
    profileDataTitle: "Данные профиля",
    myGBTitle: "Мои Великие Сооружения",
    addGBComponentTitle: "Добавьте ВС в свой список",
    gbNewExpressTitle: "Экспресс прокачка1",
    addScheduleTitle: "Данные профиля",
    sleepScheduleTitle: "Данные профиля",
    languageSelectorTitle: "Язык"
  },
  customDrawer: {
    addWorld: "Добавить мир",
    noName: "Без названия"
  },
  drawer: {
    gbLabel: "Великие сооружения",
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
    cancelButton: "Отмена"
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
    contributionRatioLabel: "Коэффициент вклада (nodeRatio):",
    contributionRatioLabelWithCoefficient: "Коэффициент вклада (nodeRatio): (коэффициент {{coefficient}})",
    allowedGBsLabel: "Разрешенные в ветке ВС (allowedGBs):",
    selectGBPlaceholder: "Выберите ВС",
    levelThresholdLabel: "Минимальный уровень ВС (levelThreshold):",
    guildMembersLabel: "Участники гильдии:",
    selectMembersPlaceholder: "Выберите участников",
    placeLimitLabel: "Ограничение мест (placeLimit):",
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
    gbNewExpressTitle: "Экспрэс прокачка1"
  },
  quantStack: {
    quantScreenTitle: "Квантаваныя ўварванні"
  },
  gbgStack: {
    gbgScreenTitle: "Поле бітвы гільдый"
  },
  profileStack: {
    profileMainTitle: "Налада профілю",
    profileDataTitle: "Дадзеныя профілю",
    myGBTitle: "Мае Вялікія Спорудкі",
    addGBComponentTitle: "Дадайце ВС да свайго спісу",
    gbNewExpressTitle: "Экспрэс прокачка1",
    addScheduleTitle: "Дадзеныя профілю",
    sleepScheduleTitle: "Дадзеныя профілю",
    languageSelectorTitle: "Мова"
  },
  customDrawer: {
    addWorld: "Дадаць свет",
    noName: "Без назвы"
  },
  drawer: {
    gbLabel: "Вялікія спорудкі",
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
    cancelButton: "Адмена"
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
    contributionRatioLabel: "Коефіцієнт внеску (nodeRatio):",
    contributionRatioLabelWithCoefficient: "Коефіцієнт внеску (nodeRatio): (коефіцієнт {{coefficient}})",
    allowedGBsLabel: "Дозволеныя ў гілцы ВС (allowedGBs):",
    selectGBPlaceholder: "Оберіть ВС",
    levelThresholdLabel: "Мінімальны ўзровень ВС (levelThreshold):",
    guildMembersLabel: "Удзельнікі гільдыі:",
    selectMembersPlaceholder: "Оберіть удзельників",
    placeLimitLabel: "Абмежаванне месцаў (placeLimit):",
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
    gbNewExpressTitle: "Express-Aufwertung1"
  },
  quantStack: {
    quantScreenTitle: "Quanteninvasionen"
  },
  gbgStack: {
    gbgScreenTitle: "Gildenkampffeld"
  },
  profileStack: {
    profileMainTitle: "Profileinstellungen",
    profileDataTitle: "Profildaten",
    myGBTitle: "Meine Großartigen Bauwerke",
    addGBComponentTitle: "Fügen Sie GS zu Ihrer Liste hinzu",
    gbNewExpressTitle: "Express-Aufwertung1",
    addScheduleTitle: "Profildaten",
    sleepScheduleTitle: "Profildaten",
    languageSelectorTitle: "Sprache"
  },
  customDrawer: {
    addWorld: "Welt hinzufügen",
    noName: "Ohne Namen"
  },
  drawer: {
    gbLabel: "Großartige Bauwerke",
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
    cancelButton: "Abbrechen"
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
    contributionRatioLabel: "Koeffizient des Beitrags (nodeRatio):",
    contributionRatioLabelWithCoefficient: "Koeffizient des Beitrags (nodeRatio): (Koeffizient {{coefficient}})",
    allowedGBsLabel: "Erlaubte GB in der Gruppe (allowedGBs):",
    selectGBPlaceholder: "Wählen Sie GB",
    levelThresholdLabel: "Mindestlevel GB (levelThreshold):",
    guildMembersLabel: "Gildenmitglieder:",
    selectMembersPlaceholder: "Wählen Sie Mitglieder",
    placeLimitLabel: "Platzbeschränkung (placeLimit):",
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
  roleSelection: {
    title: "Choose a role:",
    admin: "Administrator",
    user: "Regular user"
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
  profileStack: {
    profileMainTitle: "Profile settings",
    profileDataTitle: "Profile data",
    myGBTitle: "My Great Buildings",
    addGBComponentTitle: "Add a GB to your list",
    gbNewExpressTitle: "Express leveling",
    addScheduleTitle: "Profile data",
    sleepScheduleTitle: "Profile data",
    languageSelectorTitle: "Language"
  },
  customDrawer: {
    addWorld: "Add world",
    noName: "No name"
  },
  drawer: {
    gbLabel: "Great Buildings",
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
  roleSelection: {
    title: "Wybierz rolę:",
    admin: "Administrator",
    user: "Zwykły użytkownik"
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
    gbLabel: "Wielkie Budowle",
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

const enTranslation = deepMerge(ukTranslation, enOverrides);
const plTranslation = deepMerge(ukTranslation, plOverrides);

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
