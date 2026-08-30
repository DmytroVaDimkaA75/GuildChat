const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureVisibleNotificationPayload,
} = require("./notificationPayload");

test("adds the top-level notification text used by FCM system display", () => {
  const source = {
    data: {
      type: "chat_message",
      title: "Олег",
      body: "Повідомлення",
    },
    android: {
      priority: "high",
      notification: {
        title: "Олег",
        body: "Повідомлення",
        channelId: "chat_messages",
        sound: "smeh_minonovhasms",
      },
    },
  };

  const result = ensureVisibleNotificationPayload(source);

  assert.deepEqual(result.notification, {
    title: "Олег",
    body: "Повідомлення",
  });
  assert.equal(result.android.notification.channelId, "chat_messages");
  assert.equal(result.android.notification.sound, "smeh_minonovhasms");
  assert.equal(source.notification, undefined);
});

test("keeps an existing top-level notification payload", () => {
  const result = ensureVisibleNotificationPayload({
    notification: {
      title: "🛠️ Рекомендовано побудувати",
      body: "Сектор B2",
    },
    android: {
      notification: {
        channelId: "gbg_build",
      },
    },
  });

  assert.deepEqual(result.notification, {
    title: "🛠️ Рекомендовано побудувати",
    body: "Сектор B2",
  });
});

test("rejects a visible push when either text field is empty", () => {
  assert.throws(
    () => ensureVisibleNotificationPayload({
      data: { title: "🔬 Квантові вторгнення" },
      android: { notification: { channelId: "quantum_sector" } },
    }),
    /non-empty title and body/
  );
});
