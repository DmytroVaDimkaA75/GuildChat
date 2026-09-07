const listeners = new Set();

let currentScreen = null;

const normalizeScreenName = (value) => {
  const name = String(value || "").trim();
  return name ? name.slice(0, 120) : null;
};

export const getCurrentScreen = () => currentScreen;

export const setCurrentScreen = (value) => {
  const nextScreen = normalizeScreenName(value);
  if (nextScreen === currentScreen) return;

  currentScreen = nextScreen;
  listeners.forEach((listener) => {
    try {
      listener(currentScreen);
    } catch (error) {
      console.log(
        "❌ Не вдалося повідомити про зміну екрана:",
        error?.message || String(error)
      );
    }
  });
};

export const subscribeToCurrentScreen = (listener) => {
  if (typeof listener !== "function") return () => {};

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
