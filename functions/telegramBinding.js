const crypto = require("node:crypto");

const TELEGRAM_BIND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TELEGRAM_BIND_CODE_LENGTH = 12;
const TELEGRAM_BIND_CODE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_CREATE_COOLDOWN_MS = 10 * 1000;
const TELEGRAM_TEST_COOLDOWN_MS = 30 * 1000;
const TELEGRAM_PROCESSING_TTL_MS = 2 * 60 * 1000;
const FIREBASE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const TELEGRAM_GUILD_ADMIN_ROLES = new Set([
  "guildLeader",
  "tester",
  "developer",
]);
const BIND_COMMAND_PATTERN =
  /^\/bind(?:@([A-Za-z0-9_]{5,32}))?\s+([A-HJ-NP-Z2-9]{12})\s*$/i;

const BINDING_FEEDBACK = {
  PERMISSION_DENIED:
    "❌ Ви більше не маєте прав адміністратора цієї гільдії. " +
    "Створіть код з облікового запису адміністратора.",
  WRONG_BOT:
    "❌ Команду адресовано іншому боту. Скопіюйте актуальну команду " +
    "з налаштувань гільдії.",
  BOT_NOT_ADMIN:
    "❌ Бот не має права публікувати повідомлення в цьому каналі. " +
    "Додайте його як адміністратора з правом публікації та повторіть команду.",
  CHANNEL_ALREADY_BOUND:
    "❌ Цей канал уже прив’язаний до іншої гільдії.",
  BOT_ACCESS_LOST:
    "❌ Telegram заборонив боту доступ до каналу. Перевірте права бота " +
    "та повторіть команду.",
  CHANNEL_UNAVAILABLE:
    "❌ Telegram не дозволив перевірити цей канал. Переконайтеся, що бот " +
    "доданий до нього як адміністратор.",
  TELEGRAM_RATE_LIMITED:
    "❌ Telegram тимчасово обмежив запити. Зачекайте хвилину та повторіть команду.",
  TELEGRAM_UNAVAILABLE:
    "❌ Telegram зараз недоступний. Спробуйте повторити команду трохи пізніше.",
  INTERNAL_ERROR:
    "❌ Не вдалося завершити прив’язку через внутрішню помилку. " +
    "Створіть новий код і спробуйте ще раз.",
};

const getBindingFeedback = (errorCode) =>
  BINDING_FEEDBACK[errorCode] || BINDING_FEEDBACK.INTERNAL_ERROR;

const normalizePathSegment = (value) => {
  const normalized = String(value || "").trim();
  return FIREBASE_PATH_SEGMENT_PATTERN.test(normalized) ? normalized : "";
};

const canManageTelegramGuild = (role) =>
  TELEGRAM_GUILD_ADMIN_ROLES.has(String(role || ""));

const normalizeTelegramNumericChatId = (value) => {
  const normalized = String(value ?? "").trim();
  if (!/^-?[1-9]\d{0,15}$/.test(normalized)) return "";

  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric !== 0 ? normalized : "";
};

const normalizeBotUsername = (value) => {
  const normalized = String(value || "").replace(/^@/, "").trim();
  return BOT_USERNAME_PATTERN.test(normalized) ? normalized : "";
};

const createTelegramBindingCode = () => {
  let code = "";
  const bytes = crypto.randomBytes(TELEGRAM_BIND_CODE_LENGTH);
  for (let index = 0; index < TELEGRAM_BIND_CODE_LENGTH; index += 1) {
    code += TELEGRAM_BIND_CODE_ALPHABET[bytes[index] % TELEGRAM_BIND_CODE_ALPHABET.length];
  }
  return code;
};

const hashTelegramBindingCode = (code) =>
  crypto
    .createHash("sha256")
    .update(String(code || "").trim().toUpperCase(), "utf8")
    .digest("hex");

const parseTelegramBindCommand = (text) => {
  const match = String(text || "").match(BIND_COMMAND_PATTERN);
  if (!match) return null;

  return {
    botUsername: normalizeBotUsername(match[1]),
    code: String(match[2] || "").toUpperCase(),
  };
};

const createTelegramWebhookSecret = (token) =>
  crypto
    .createHash("sha256")
    .update(`guildchat-telegram-webhook:${String(token || "")}`, "utf8")
    .digest("hex");

const createTelegramBindingProof = ({
  token,
  guildId,
  chatId,
  botId,
  bindingVersion,
}) =>
  crypto
    .createHmac("sha256", String(token || ""))
    .update(
      [
        String(guildId || ""),
        String(chatId || ""),
        String(botId || ""),
        String(bindingVersion || ""),
      ].join("\n"),
      "utf8"
    )
    .digest("hex");

const timingSafeStringEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const isValidTelegramBinding = ({ token, guildId, binding }) => {
  if (!binding || binding.status !== "connected") return false;

  const normalizedGuildId = normalizePathSegment(guildId);
  const chatId = normalizeTelegramNumericChatId(binding.chatId);
  const botId = String(binding.botId || "").trim();
  const bindingVersion = String(binding.bindingVersion || "").trim();
  const proof = String(binding.bindingProof || "").trim();

  if (!token || !normalizedGuildId || !chatId || !botId || !bindingVersion || !proof) {
    return false;
  }

  const expectedProof = createTelegramBindingProof({
    token,
    guildId: normalizedGuildId,
    chatId,
    botId,
    bindingVersion,
  });
  return timingSafeStringEqual(proof, expectedProof);
};

const getTelegramChannelIndexKey = (chatId) => {
  const normalized = normalizeTelegramNumericChatId(chatId);
  if (!normalized) return "";
  return normalized.startsWith("-")
    ? `negative_${normalized.slice(1)}`
    : `positive_${normalized}`;
};

const escapeTelegramHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const getTelegramWebhookUrl = () => {
  if (String(process.env.FUNCTIONS_EMULATOR || "").toLowerCase() === "true") {
    return "";
  }

  const projectId = String(
    process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      ""
  ).trim();
  if (!projectId) return "";

  return `https://europe-west1-${projectId}.cloudfunctions.net/telegramWebhook`;
};

const telegramApiRequest = async ({
  token,
  method,
  body = {},
  timeoutMs = 15000,
}) => {
  if (!token || !method) {
    return {
      ok: false,
      status: 0,
      errorCode: "TELEGRAM_NOT_CONFIGURED",
      description: "Telegram bot is not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    const payload = await response.json().catch(() => null);
    const ok = response.ok && payload?.ok === true;

    return {
      ok,
      status: response.status,
      result: payload?.result,
      description: String(payload?.description || ""),
      errorCode: ok ? "" : String(payload?.error_code || response.status || ""),
      retryAfter: Number(payload?.parameters?.retry_after || 0),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorCode: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      description: error?.message || "Telegram request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const mapTelegramApiError = (result) => {
  if (result?.status === 403) return "BOT_ACCESS_LOST";
  if (result?.status === 429) return "TELEGRAM_RATE_LIMITED";
  if (result?.status === 400) return "CHANNEL_UNAVAILABLE";
  return "TELEGRAM_UNAVAILABLE";
};

const createTelegramBindingFunctions = ({
  admin,
  logger,
  onCall,
  onRequest,
  telegramBotToken,
}) => {
  const db = () => admin.database();

  const runTransactionWithLoadedValue = async (ref, updateValue) => {
    let valueListener;
    let cancelListener;
    let initialValueReceived = false;
    const initialSnapshot = await new Promise((resolve, reject) => {
      valueListener = (snapshot) => {
        if (initialValueReceived) return;
        initialValueReceived = true;
        resolve(snapshot);
      };
      cancelListener = (error) => {
        if (initialValueReceived) return;
        initialValueReceived = true;
        reject(error);
      };
      ref.on("value", valueListener, cancelListener);
    });

    try {
      const result = await ref.transaction(updateValue);
      return { initialSnapshot, result };
    } finally {
      ref.off("value", valueListener);
    }
  };

  const sendBindingFeedback = async ({
    token,
    chatId,
    text,
    updateId = "",
  }) => {
    const result = await telegramApiRequest({
      token,
      method: "sendMessage",
      body: {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      },
    });
    if (!result.ok) {
      logger.warn("[TG Binding] Could not send binding feedback", {
        updateId: String(updateId),
        status: result.status,
        errorCode: result.errorCode,
      });
    }
  };

  const verifyGuildAdmin = async ({ guildId, userId }) => {
    const normalizedGuildId = normalizePathSegment(guildId);
    const normalizedUserId = normalizePathSegment(userId);
    if (!normalizedGuildId || !normalizedUserId) {
      return { ok: false, error: "INVALID_ARGUMENT" };
    }

    const [memberSnapshot, roleSnapshot] = await Promise.all([
      db()
        .ref(`/guilds/${normalizedGuildId}/guildUsers/${normalizedUserId}`)
        .once("value"),
      db()
        .ref(`/users/${normalizedUserId}/${normalizedGuildId}/role`)
        .once("value"),
    ]);
    const role = roleSnapshot.exists() ? String(roleSnapshot.val() || "") : "";

    if (
      !memberSnapshot.exists() ||
      !canManageTelegramGuild(role)
    ) {
      return { ok: false, error: "PERMISSION_DENIED" };
    }

    return {
      ok: true,
      guildId: normalizedGuildId,
      userId: normalizedUserId,
      role,
    };
  };

  const acquireCooldown = async ({ path, now, cooldownMs, value = {} }) => {
    const rateRef = db().ref(path);
    const result = await rateRef.transaction((current) => {
      const lastAt = Number(
        current && typeof current === "object" ? current.lastAt : current
      );
      if (Number.isFinite(lastAt) && now - lastAt < cooldownMs) {
        return;
      }
      return { ...value, lastAt: now };
    });

    if (result.committed) return { ok: true };
    const current = result.snapshot?.val();
    const lastAt = Number(
      current && typeof current === "object" ? current.lastAt : current
    );
    return {
      ok: false,
      retryAfterMs: Math.max(
        1000,
        cooldownMs - (now - (Number.isFinite(lastAt) ? lastAt : now))
      ),
    };
  };

  const ensureTelegramWebhook = async (token) => {
    const webhookUrl = getTelegramWebhookUrl();
    if (!webhookUrl) {
      return { ok: false, error: "WEBHOOK_URL_UNAVAILABLE" };
    }

    const meResult = await telegramApiRequest({
      token,
      method: "getMe",
    });
    const botUsername = normalizeBotUsername(meResult?.result?.username);
    const botId = String(meResult?.result?.id || "").trim();
    if (!meResult.ok || !botUsername || !botId) {
      return {
        ok: false,
        error: mapTelegramApiError(meResult),
      };
    }

    const webhookResult = await telegramApiRequest({
      token,
      method: "setWebhook",
      body: {
        url: webhookUrl,
        secret_token: createTelegramWebhookSecret(token),
        allowed_updates: [
          "message",
          "channel_post",
          "edited_message",
          "edited_channel_post",
        ],
        drop_pending_updates: false,
      },
    });
    if (!webhookResult.ok) {
      return {
        ok: false,
        error: mapTelegramApiError(webhookResult),
      };
    }

    await db().ref("/telegramBot/profile").set({
      botId,
      botUsername,
      webhookConfiguredAt: admin.database.ServerValue.TIMESTAMP,
    });

    return { ok: true, botId, botUsername };
  };

  const setPendingError = async ({
    guildId,
    codeHash,
    requestId,
    updateId,
    errorCode,
    keepCode = true,
  }) => {
    const now = Date.now();
    const pendingRef = db().ref(`/telegramBot/pendingByGuild/${guildId}`);
    await runTransactionWithLoadedValue(
      pendingRef,
      (current) => {
        if (
          !current ||
          current.requestId !== requestId ||
          current.codeHash !== codeHash
        ) {
          return;
        }

        if (!keepCode) return null;
        return {
          ...current,
          status: "error",
          errorCode,
          lastUpdateId: String(updateId || ""),
          updatedAt: now,
          processingExpiresAt: null,
        };
      }
    );

    const codeRef = db().ref(`/telegramBot/bindingCodes/${codeHash}`);
    await runTransactionWithLoadedValue(
      codeRef,
      (current) => {
        if (!current || current.requestId !== requestId) return;
        if (!keepCode) return null;
        return {
          ...current,
          status: "pending",
          errorCode,
          updatedAt: now,
          processingExpiresAt: null,
        };
      }
    );

    const publicTelegramRef = db().ref(
      `/guilds/${guildId}/setting/telegram`
    );
    const publicPendingRef = publicTelegramRef.child("pendingBinding");
    const publicSnapshot = await publicPendingRef.once("value");
    const publicPending = publicSnapshot.exists()
      ? publicSnapshot.val() || {}
      : {};
    if (publicPending.requestId === requestId) {
      if (keepCode) {
        await publicPendingRef.update({
          status: "error",
          errorCode,
          updatedAt: now,
        });
      } else {
        await publicTelegramRef.update({
          status: "error",
          errorCode,
          updatedAt: now,
          pendingBinding: null,
        });
      }
    }
  };

  const markBindingUnavailable = async ({ guildId, binding, errorCode }) => {
    const internalRef = db().ref(`/telegramBot/guildBindings/${guildId}`);
    const currentSnapshot = await internalRef.once("value");
    const current = currentSnapshot.exists() ? currentSnapshot.val() : null;
    if (
      !current ||
      current.bindingVersion !== binding.bindingVersion ||
      current.chatId !== binding.chatId
    ) {
      return;
    }

    await Promise.all([
      internalRef.update({
        status: "error",
        errorCode,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      }),
      db().ref(`/guilds/${guildId}/setting/telegram`).update({
        status: "error",
        errorCode,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      }),
    ]);
  };

  const processBindingUpdate = async ({ update, token }) => {
    const message =
      update?.channel_post ||
      update?.message ||
      update?.edited_channel_post ||
      update?.edited_message;
    const updateId = String(update?.update_id ?? "");
    if (!message || !message.chat) {
      logger.info("[TG Binding] Update has no supported message", {
        updateId,
      });
      return;
    }

    const chatType = String(message.chat.type || "");
    const chatId = normalizeTelegramNumericChatId(message.chat.id);
    if (!chatId) return;
    const rawText = String(message.text || message.caption || "").trim();
    if (!["channel", "supergroup", "group"].includes(chatType)) {
      if (/^\/bind(?:@[A-Za-z0-9_]{5,32})?(?:\s|$)/i.test(rawText)) {
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text:
            "❌ Команду /bind потрібно опублікувати безпосередньо в каналі " +
            "або групі, яку ви хочете прив’язати.",
        });
      }
      return;
    }

    const command = parseTelegramBindCommand(rawText);
    if (!command) {
      if (/^\/bind(?:@[A-Za-z0-9_]{5,32})?(?:\s|$)/i.test(rawText)) {
        logger.info("[TG Binding] Malformed bind command", {
          updateId,
          chatType,
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text:
            "❌ Неправильний формат команди. Скопіюйте повну команду " +
            "/bind з актуальним 12-символьним кодом із застосунку.",
        });
      }
      return;
    }

    const codeHash = hashTelegramBindingCode(command.code);
    logger.info("[TG Binding] Bind command received", {
      updateId,
      chatType,
      codeHashPrefix: codeHash.slice(0, 12),
    });
    const codeRef = db().ref(`/telegramBot/bindingCodes/${codeHash}`);
    const codeSnapshot = await codeRef.once("value");
    if (!codeSnapshot.exists()) {
      logger.info("[TG Binding] Binding code not found", {
        updateId,
        chatType,
      });
      await sendBindingFeedback({
        token,
        chatId,
        updateId,
        text:
          "❌ Код не знайдено або термін його дії вже завершився. " +
          "Створіть новий код у налаштуваннях гільдії та вставте команду ще раз.",
      });
      return;
    }

    const codeData = codeSnapshot.val() || {};
    const guildId = normalizePathSegment(codeData.guildId);
    const userId = normalizePathSegment(codeData.requestedBy);
    const requestId = String(codeData.requestId || "");
    const now = Date.now();
    if (!guildId || !userId || !requestId) {
      logger.error("[TG Binding] Binding code record is invalid", {
        updateId,
        codeHashPrefix: codeHash.slice(0, 12),
      });
      await sendBindingFeedback({
        token,
        chatId,
        updateId,
        text: getBindingFeedback("INTERNAL_ERROR"),
      });
      return;
    }

    if (Number(codeData.expiresAt || 0) <= now) {
      await setPendingError({
        guildId,
        codeHash,
        requestId,
        updateId,
        errorCode: "CODE_EXPIRED",
        keepCode: false,
      });
      await sendBindingFeedback({
        token,
        chatId,
        updateId,
        text:
          "❌ Термін дії коду завершився. Створіть новий код у " +
          "налаштуваннях гільдії та вставте команду ще раз.",
      });
      return;
    }

    const pendingRef = db().ref(`/telegramBot/pendingByGuild/${guildId}`);
    // A transaction updater is initially called from RTDB's local cache. A
    // cold Cloud Function has no value there, so an updater that rejects
    // `null` aborts before contacting the server. Keep a value listener active
    // until the transaction finishes so the first value is the server state.
    const { result: claimResult } = await runTransactionWithLoadedValue(
      pendingRef,
      (current) => {
        if (
          !current ||
          current.codeHash !== codeHash ||
          current.requestId !== requestId ||
          !["pending", "error"].includes(current.status) ||
          Number(current.expiresAt || 0) <= now
        ) {
          return;
        }

        return {
          ...current,
          status: "processing",
          errorCode: null,
          updateId,
          chatId,
          processingStartedAt: now,
          processingExpiresAt: now + TELEGRAM_PROCESSING_TTL_MS,
        };
      }
    );
    if (!claimResult.committed) {
      const current = claimResult.snapshot?.val() || null;
      logger.warn("[TG Binding] Binding claim transaction rejected", {
        guildId,
        updateId,
        codeHashPrefix: codeHash.slice(0, 12),
        pendingExists: Boolean(current),
        sameCode: current?.codeHash === codeHash,
        sameRequest: current?.requestId === requestId,
        pendingStatus: String(current?.status || ""),
      });
      await sendBindingFeedback({
        token,
        chatId,
        updateId,
        text:
          current?.status === "processing"
            ? "ℹ️ Прив’язка цього каналу вже обробляється. Зачекайте кілька секунд."
            : "❌ Стан коду змінився під час прив’язки. Створіть новий код і повторіть команду.",
      });
      return;
    }

    try {
      await codeRef.update({
        status: "processing",
        updateId,
        chatId,
        processingStartedAt: now,
        processingExpiresAt: now + TELEGRAM_PROCESSING_TTL_MS,
      });

      const permission = await verifyGuildAdmin({ guildId, userId });
      if (!permission.ok) {
        await setPendingError({
          guildId,
          codeHash,
          requestId,
          updateId,
          errorCode: permission.error,
          keepCode: false,
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text: getBindingFeedback(permission.error),
        });
        return;
      }

      const meResult = await telegramApiRequest({ token, method: "getMe" });
      const botUsername = normalizeBotUsername(meResult?.result?.username);
      const botId = String(meResult?.result?.id || "").trim();
      if (!meResult.ok || !botUsername || !botId) {
        await setPendingError({
          guildId,
          codeHash,
          requestId,
          updateId,
          errorCode: "TELEGRAM_UNAVAILABLE",
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text: getBindingFeedback("TELEGRAM_UNAVAILABLE"),
        });
        return;
      }

      if (
        command.botUsername &&
        command.botUsername.toLowerCase() !== botUsername.toLowerCase()
      ) {
        await setPendingError({
          guildId,
          codeHash,
          requestId,
          updateId,
          errorCode: "WRONG_BOT",
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text: getBindingFeedback("WRONG_BOT"),
        });
        return;
      }

      const memberResult = await telegramApiRequest({
        token,
        method: "getChatMember",
        body: { chat_id: chatId, user_id: botId },
      });
      if (!memberResult.ok) {
        const errorCode = mapTelegramApiError(memberResult);
        await setPendingError({
          guildId,
          codeHash,
          requestId,
          updateId,
          errorCode,
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text: getBindingFeedback(errorCode),
        });
        return;
      }

      const member = memberResult.result || {};
      const isAdministrator =
        member.status === "administrator" || member.status === "creator";
      const canPost =
        chatType === "channel"
          ? member.status === "administrator" &&
            member.can_post_messages === true
          : isAdministrator;
      if (!canPost) {
        await setPendingError({
          guildId,
          codeHash,
          requestId,
          updateId,
          errorCode: "BOT_NOT_ADMIN",
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text: getBindingFeedback("BOT_NOT_ADMIN"),
        });
        return;
      }

      const channelIndexKey = getTelegramChannelIndexKey(chatId);
      const channelIndexRef = db().ref(
        `/telegramBot/channelBindings/${channelIndexKey}`
      );
      const channelReservation = await channelIndexRef.transaction((current) => {
        const currentGuildId =
          typeof current === "string"
            ? current
            : String(current?.guildId || "");
        if (currentGuildId && currentGuildId !== guildId) return;
        return {
          guildId,
          requestId,
          reservedAt: now,
        };
      });
      if (!channelReservation.committed) {
        await setPendingError({
          guildId,
          codeHash,
          requestId,
          updateId,
          errorCode: "CHANNEL_ALREADY_BOUND",
        });
        await sendBindingFeedback({
          token,
          chatId,
          updateId,
          text: getBindingFeedback("CHANNEL_ALREADY_BOUND"),
        });
        return;
      }

      const oldBindingSnapshot = await db()
        .ref(`/telegramBot/guildBindings/${guildId}`)
        .once("value");
      const oldBinding = oldBindingSnapshot.exists()
        ? oldBindingSnapshot.val() || {}
        : {};
      const oldChatId = normalizeTelegramNumericChatId(oldBinding.chatId);
      const bindingVersion = crypto.randomUUID();
      const bindingProof = createTelegramBindingProof({
        token,
        guildId,
        chatId,
        botId,
        bindingVersion,
      });
      const chatTitle = String(message.chat.title || "").trim().slice(0, 200);
      const chatUsername = normalizeBotUsername(message.chat.username);
      const connectedAt = admin.database.ServerValue.TIMESTAMP;

      const internalBinding = {
        status: "connected",
        chatId,
        chatType,
        chatTitle,
        chatUsername,
        botId,
        botUsername,
        connectedAt,
        connectedBy: userId,
        bindingUpdateId: updateId,
        bindingVersion,
        bindingProof,
      };
      const publicBinding = {
        status: "connected",
        chatType,
        chatTitle,
        chatUsername,
        botUsername,
        connectedAt,
        connectedBy: userId,
      };
      const updates = {
        [`/telegramBot/guildBindings/${guildId}`]: internalBinding,
        [`/telegramBot/channelBindings/${channelIndexKey}`]: {
          guildId,
          bindingVersion,
          connectedAt,
        },
        [`/telegramBot/bindingCodes/${codeHash}`]: null,
        [`/telegramBot/pendingByGuild/${guildId}`]: null,
        [`/guilds/${guildId}/setting/telegram`]: publicBinding,
      };

      if (oldChatId && oldChatId !== chatId) {
        const oldIndexKey = getTelegramChannelIndexKey(oldChatId);
        const oldIndexRef = db().ref(
          `/telegramBot/channelBindings/${oldIndexKey}`
        );
        const oldIndexSnapshot = await oldIndexRef.once("value");
        const oldIndex = oldIndexSnapshot.exists()
          ? oldIndexSnapshot.val()
          : null;
        const oldIndexGuildId =
          typeof oldIndex === "string"
            ? oldIndex
            : String(oldIndex?.guildId || "");
        if (oldIndexGuildId === guildId) {
          updates[`/telegramBot/channelBindings/${oldIndexKey}`] = null;
        }
      }

      await db().ref().update(updates);

      const guildSnapshot = await db()
        .ref(`/guilds/${guildId}/guildName`)
        .once("value");
      const guildName = guildSnapshot.exists()
        ? String(guildSnapshot.val() || "").trim()
        : "";
      const confirmationText = guildName
        ? `✅ Канал успішно прив’язано до гільдії <b>${escapeTelegramHtml(
            guildName
          )}</b>.`
        : "✅ Канал успішно прив’язано до гільдії.";
      const confirmationResult = await telegramApiRequest({
        token,
        method: "sendMessage",
        body: {
          chat_id: chatId,
          text: confirmationText,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
      });
      if (!confirmationResult.ok) {
        logger.warn("[TG Binding] Confirmation message failed", {
          guildId,
          status: confirmationResult.status,
        });
      } else {
        logger.info("[TG Binding] Channel connected", {
          guildId,
          updateId,
          chatType,
        });
      }
    } catch (error) {
      logger.error("[TG Binding] Could not process bind command", {
        guildId,
        updateId,
        error: error?.message || String(error),
      });
      await setPendingError({
        guildId,
        codeHash,
        requestId,
        updateId,
        errorCode: "INTERNAL_ERROR",
      }).catch((resetError) => {
        logger.error("[TG Binding] Could not reset binding code", {
          guildId,
          updateId,
          error: resetError?.message || String(resetError),
        });
      });
      await sendBindingFeedback({
        token,
        chatId,
        updateId,
        text: getBindingFeedback("INTERNAL_ERROR"),
      }).catch((feedbackError) => {
        logger.error("[TG Binding] Could not send internal-error feedback", {
          guildId,
          updateId,
          error: feedbackError?.message || String(feedbackError),
        });
      });
    }
  };

  const createBindingCode = onCall(
    {
      region: "europe-west1",
      secrets: [telegramBotToken],
    },
    async (request) => {
      const permission = await verifyGuildAdmin(request.data || {});
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const { guildId, userId } = permission;
      const token = telegramBotToken.value();
      if (!token) {
        return { success: false, error: "TELEGRAM_NOT_CONFIGURED" };
      }

      const now = Date.now();
      const cooldown = await acquireCooldown({
        path: `/telegramBot/rateLimits/create/${guildId}`,
        now,
        cooldownMs: TELEGRAM_CREATE_COOLDOWN_MS,
        value: { requestedBy: userId },
      });
      if (!cooldown.ok) {
        return {
          success: false,
          error: "TOO_SOON",
          retryAfterMs: cooldown.retryAfterMs,
        };
      }

      const webhook = await ensureTelegramWebhook(token);
      if (!webhook.ok) {
        logger.error("[TG Binding] Could not configure webhook", {
          guildId,
          error: webhook.error,
        });
        return { success: false, error: webhook.error };
      }

      let code = "";
      let codeHash = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        code = createTelegramBindingCode();
        codeHash = hashTelegramBindingCode(code);
        const collision = await db()
          .ref(`/telegramBot/bindingCodes/${codeHash}`)
          .once("value");
        if (!collision.exists()) break;
        code = "";
        codeHash = "";
      }
      if (!code || !codeHash) {
        return { success: false, error: "CODE_GENERATION_FAILED" };
      }

      const requestId = crypto.randomUUID();
      const expiresAt = now + TELEGRAM_BIND_CODE_TTL_MS;
      const pendingRef = db().ref(`/telegramBot/pendingByGuild/${guildId}`);
      const oldPendingSnapshot = await pendingRef.once("value");
      const oldPending = oldPendingSnapshot.exists()
        ? oldPendingSnapshot.val() || {}
        : {};
      const lockResult = await pendingRef.transaction((current) => {
        const processingExpiresAt = Number(current?.processingExpiresAt || 0);
        const lockExpiresAt = Number(current?.lockExpiresAt || 0);
        if (
          (current?.status === "processing" &&
            processingExpiresAt > now) ||
          (["rotating", "disconnecting"].includes(current?.status) &&
            lockExpiresAt > now)
        ) {
          return;
        }
        return {
          status: "rotating",
          requestId,
          requestedBy: userId,
          lockExpiresAt: now + 30000,
        };
      });
      if (!lockResult.committed) {
        return { success: false, error: "BINDING_BUSY" };
      }

      const updates = {
        [`/telegramBot/bindingCodes/${codeHash}`]: {
          guildId,
          requestedBy: userId,
          requestId,
          status: "pending",
          createdAt: now,
          expiresAt,
        },
        [`/telegramBot/pendingByGuild/${guildId}`]: {
          codeHash,
          requestedBy: userId,
          requestId,
          status: "pending",
          createdAt: now,
          expiresAt,
        },
        [`/guilds/${guildId}/setting/telegram`]: {
          status: "pending",
          pendingBinding: {
            requestId,
            requestedBy: userId,
            botUsername: webhook.botUsername,
            status: "pending",
            createdAt: now,
            expiresAt,
          },
        },
      };
      const oldCodeHash = String(oldPending.codeHash || "");
      if (oldCodeHash && oldCodeHash !== codeHash) {
        updates[`/telegramBot/bindingCodes/${oldCodeHash}`] = null;
      }
      await db().ref().update(updates);

      return {
        success: true,
        requestId,
        code,
        command: `/bind ${code}`,
        expiresAt,
        botUsername: webhook.botUsername,
        addChannelUrl:
          `https://t.me/${webhook.botUsername}` +
          "?startchannel&admin=post_messages",
      };
    }
  );

  const testBinding = onCall(
    {
      region: "europe-west1",
      secrets: [telegramBotToken],
    },
    async (request) => {
      const permission = await verifyGuildAdmin(request.data || {});
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const { guildId, userId } = permission;
      const token = telegramBotToken.value();
      const bindingSnapshot = await db()
        .ref(`/telegramBot/guildBindings/${guildId}`)
        .once("value");
      const binding = bindingSnapshot.exists()
        ? bindingSnapshot.val() || {}
        : null;
      if (!isValidTelegramBinding({ token, guildId, binding })) {
        return { success: false, error: "NOT_CONNECTED" };
      }

      const now = Date.now();
      const cooldown = await acquireCooldown({
        path: `/telegramBot/rateLimits/test/${guildId}`,
        now,
        cooldownMs: TELEGRAM_TEST_COOLDOWN_MS,
        value: { requestedBy: userId },
      });
      if (!cooldown.ok) {
        return {
          success: false,
          error: "TOO_SOON",
          retryAfterMs: cooldown.retryAfterMs,
        };
      }

      const memberResult = await telegramApiRequest({
        token,
        method: "getChatMember",
        body: { chat_id: binding.chatId, user_id: binding.botId },
      });
      const member = memberResult.result || {};
      const canPost =
        binding.chatType === "channel"
          ? member.status === "administrator" &&
            member.can_post_messages === true
          : member.status === "administrator" || member.status === "creator";
      if (!memberResult.ok || !canPost) {
        const errorCode = memberResult.ok
          ? "BOT_NOT_ADMIN"
          : mapTelegramApiError(memberResult);
        await markBindingUnavailable({ guildId, binding, errorCode });
        return { success: false, error: errorCode };
      }

      const sendResult = await telegramApiRequest({
        token,
        method: "sendMessage",
        body: {
          chat_id: binding.chatId,
          text: "✅ Тестове повідомлення GuildChat. Telegram-сповіщення для цієї гільдії працюють.",
          disable_web_page_preview: true,
        },
      });
      if (!sendResult.ok) {
        const errorCode = mapTelegramApiError(sendResult);
        if (sendResult.status === 400 || sendResult.status === 403) {
          await markBindingUnavailable({ guildId, binding, errorCode });
        }
        return {
          success: false,
          error: errorCode,
          retryAfter: sendResult.retryAfter || 0,
        };
      }

      await db()
        .ref(`/telegramBot/guildBindings/${guildId}`)
        .update({
          lastTestAt: admin.database.ServerValue.TIMESTAMP,
          lastTestBy: userId,
        });
      return { success: true };
    }
  );

  const disconnectBinding = onCall(
    {
      region: "europe-west1",
      secrets: [telegramBotToken],
    },
    async (request) => {
      const permission = await verifyGuildAdmin(request.data || {});
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const { guildId } = permission;
      const now = Date.now();
      const pendingRef = db().ref(`/telegramBot/pendingByGuild/${guildId}`);
      const disconnectClaim = await pendingRef.transaction((current) => {
        const processingExpiresAt = Number(current?.processingExpiresAt || 0);
        const lockExpiresAt = Number(current?.lockExpiresAt || 0);
        if (
          (current?.status === "processing" &&
            processingExpiresAt > now) ||
          (current?.status === "rotating" && lockExpiresAt > now)
        ) {
          return;
        }
        return {
          ...(current || {}),
          status: "disconnecting",
          disconnectId: crypto.randomUUID(),
          lockExpiresAt: now + 30000,
        };
      });
      if (!disconnectClaim.committed) {
        return { success: false, error: "BINDING_BUSY" };
      }

      const bindingSnapshot = await db()
        .ref(`/telegramBot/guildBindings/${guildId}`)
        .once("value");
      const binding = bindingSnapshot.exists()
        ? bindingSnapshot.val() || {}
        : {};
      const pending = disconnectClaim.snapshot?.val() || {};
      const updates = {
        [`/telegramBot/guildBindings/${guildId}`]: null,
        [`/telegramBot/pendingByGuild/${guildId}`]: null,
        [`/guilds/${guildId}/setting/telegram`]: null,
      };

      const codeHash = String(pending.codeHash || "");
      if (codeHash) {
        updates[`/telegramBot/bindingCodes/${codeHash}`] = null;
      }

      const chatId = normalizeTelegramNumericChatId(binding.chatId);
      if (chatId) {
        const channelIndexKey = getTelegramChannelIndexKey(chatId);
        const channelIndexSnapshot = await db()
          .ref(`/telegramBot/channelBindings/${channelIndexKey}`)
          .once("value");
        const channelIndex = channelIndexSnapshot.exists()
          ? channelIndexSnapshot.val()
          : null;
        const channelGuildId =
          typeof channelIndex === "string"
            ? channelIndex
            : String(channelIndex?.guildId || "");
        if (channelGuildId === guildId) {
          updates[`/telegramBot/channelBindings/${channelIndexKey}`] = null;
        }
      }

      await db().ref().update(updates);
      return { success: true };
    }
  );

  const telegramWebhook = onRequest(
    {
      region: "europe-west1",
      secrets: [telegramBotToken],
      cors: false,
      invoker: "public",
    },
    async (request, response) => {
      const token = telegramBotToken.value();
      const receivedSecret = String(
        request.get("X-Telegram-Bot-Api-Secret-Token") || ""
      );
      const expectedSecret = createTelegramWebhookSecret(token);
      if (!token || !timingSafeStringEqual(receivedSecret, expectedSecret)) {
        response.status(403).send("Forbidden");
        return;
      }

      if (request.method !== "POST") {
        response.status(405).send("Method Not Allowed");
        return;
      }

      try {
        const update =
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body;
        await processBindingUpdate({ update, token });
      } catch (error) {
        logger.error("[TG Binding] Webhook processing error", {
          error: error?.message || String(error),
        });
      }

      response.status(200).send("OK");
    }
  );

  return {
    createBindingCode,
    testBinding,
    disconnectBinding,
    telegramWebhook,
  };
};

module.exports = {
  canManageTelegramGuild,
  createTelegramBindingCode,
  createTelegramBindingFunctions,
  createTelegramBindingProof,
  createTelegramWebhookSecret,
  getTelegramChannelIndexKey,
  hashTelegramBindingCode,
  isValidTelegramBinding,
  normalizeTelegramNumericChatId,
  parseTelegramBindCommand,
  telegramApiRequest,
  timingSafeStringEqual,
};
