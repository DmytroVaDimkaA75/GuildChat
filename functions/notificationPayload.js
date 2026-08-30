const getNonEmptyText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

const ensureVisibleNotificationPayload = (payload) => {
  const source = payload && typeof payload === "object" ? payload : {};
  const androidNotification = source.android?.notification || {};
  const apnsAlert = source.apns?.payload?.aps?.alert;
  const structuredApnsAlert =
    apnsAlert && typeof apnsAlert === "object" ? apnsAlert : {};
  const title = getNonEmptyText(
    source.notification?.title,
    androidNotification.title,
    source.data?.title,
    structuredApnsAlert.title
  );
  const body = getNonEmptyText(
    source.notification?.body,
    androidNotification.body,
    source.data?.body,
    structuredApnsAlert.body
  );

  if (!title || !body) {
    throw new TypeError("Visible FCM notifications require non-empty title and body");
  }

  return {
    ...source,
    notification: {
      ...(source.notification || {}),
      title,
      body,
    },
  };
};

module.exports = {
  ensureVisibleNotificationPayload,
};
