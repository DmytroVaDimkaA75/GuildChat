import AsyncStorage from "@react-native-async-storage/async-storage";

export const PENDING_NOTIFICATION_ROUTE_KEY = "pendingNotificationRoute";
export const PENDING_NOTIFICATION_ROUTE_TTL_MS = 24 * 60 * 60 * 1000;

let storageMutationChain = Promise.resolve();

const asString = (value) =>
  value === undefined || value === null ? "" : String(value);

const enqueueStorageMutation = (mutation) => {
  const result = storageMutationChain.then(mutation, mutation);
  storageMutationChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

export const normalizeNotificationRoute = (source) => {
  const sourceData =
    source?.data && typeof source.data === "object" ? source.data : source;
  const data = sourceData && typeof sourceData === "object" ? sourceData : {};
  const type = asString(data.type);

  if (
    ![
      "chat_message",
      "gbg_sector_open",
      "gbg_build_plan",
      "gbg_help",
      "culture_build_ready",
    ].includes(type)
  ) {
    return null;
  }

  const guildId = asString(data.guildId);
  const chatId = asString(data.chatId);
  const messageId = asString(data.messageId);
  const notificationEventId = asString(
    data.notificationEventId || source?.messageId
  );
  const parsedCreatedAt = Number(data.createdAt);
  const createdAt =
    Number.isFinite(parsedCreatedAt) && parsedCreatedAt > 0
      ? parsedCreatedAt
      : Date.now();

  if (type === "chat_message" && !chatId) return null;

  const route = {
    type,
    guildId,
    chatId,
    messageId,
    notificationEventId,
    sectorId: asString(data.sectorId),
    settlementName: asString(data.settlementName),
    createdAt,
  };

  const eventKey =
    route.type === "chat_message" && route.messageId
      ? route.messageId
      : route.notificationEventId;

  route.key = [
    route.type,
    route.guildId,
    route.chatId,
    eventKey,
    route.sectorId,
    route.settlementName,
  ].join("|");

  return route;
};

const readStoredNotificationRoute = async () => {
  const rawValue = await AsyncStorage.getItem(PENDING_NOTIFICATION_ROUTE_KEY);
  if (!rawValue) return { rawValue: "", route: null, invalid: false };

  try {
    const route = normalizeNotificationRoute(JSON.parse(rawValue));
    return {
      rawValue,
      route,
      invalid: !route,
    };
  } catch (_error) {
    return { rawValue, route: null, invalid: true };
  }
};

export const savePendingNotificationRoute = async (routeOrSource) => {
  const route = normalizeNotificationRoute(routeOrSource);
  if (!route) return null;

  await enqueueStorageMutation(() =>
    AsyncStorage.setItem(
      PENDING_NOTIFICATION_ROUTE_KEY,
      JSON.stringify(route)
    )
  );
  return route;
};

export const readPendingNotificationRoute = async () => {
  await storageMutationChain;
  const stored = await readStoredNotificationRoute();

  if (stored.invalid) {
    await enqueueStorageMutation(async () => {
      const currentRawValue = await AsyncStorage.getItem(
        PENDING_NOTIFICATION_ROUTE_KEY
      );
      if (currentRawValue === stored.rawValue) {
        await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
      }
    });
    return null;
  }

  const route = stored.route;
  if (!route) return null;

  if (Date.now() - route.createdAt > PENDING_NOTIFICATION_ROUTE_TTL_MS) {
    await clearPendingNotificationRoute(route);
    return null;
  }

  return route;
};

export const clearPendingNotificationRoute = async (expectedRouteOrKey = "") =>
  enqueueStorageMutation(async () => {
    const expectedKey =
      typeof expectedRouteOrKey === "object"
        ? asString(expectedRouteOrKey?.key)
        : asString(expectedRouteOrKey);
    const expectedCreatedAt =
      typeof expectedRouteOrKey === "object"
        ? Number(expectedRouteOrKey?.createdAt || 0)
        : 0;
    const { route: current } = await readStoredNotificationRoute();

    if (expectedKey && current && current.key !== expectedKey) return false;
    if (
      expectedCreatedAt &&
      current &&
      current.createdAt !== expectedCreatedAt
    ) {
      return false;
    }

    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
    return true;
  });
