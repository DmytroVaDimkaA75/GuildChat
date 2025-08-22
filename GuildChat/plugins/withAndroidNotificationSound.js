// GuildChat/plugins/withAndroidNotificationSound.js
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * Примусово копіює sound-файл у android/app/src/main/res/raw.
 * Використовує назву файлу (без розширення) як ім'я ресурсу.
 *
 * Параметри:
 *   soundFile (обов'язково): відносний шлях від кореня проєкту до mp3 (напр., "./assets/alert.mp3")
 *   destName (необов'язково): як назвати файл у res/raw (напр., "alert.mp3"). За замовчуванням — як у вихідному файлі.
 */
module.exports = function withAndroidNotificationSound(config, { soundFile, destName } = {}) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot; // корінь проєкту (де app.json)
      const androidRoot = config.modRequest.platformProjectRoot; // шлях до згенерованої папки android

      if (!soundFile) {
        throw new Error("withAndroidNotificationSound: 'soundFile' is required (e.g., './assets/alert.wav').");
      }

      const src = path.resolve(projectRoot, soundFile);
      if (!fs.existsSync(src)) {
        throw new Error(`withAndroidNotificationSound: source sound file not found at: ${src}`);
      }

      const rawDir = path.join(androidRoot, "app", "src", "main", "res", "raw");
      await fs.promises.mkdir(rawDir, { recursive: true });

      const baseName = (destName || path.basename(src)).toLowerCase().replace(/\s+/g, "_");
      const dest = path.join(rawDir, baseName);

      await fs.promises.copyFile(src, dest);
      console.log(`[withAndroidNotificationSound] Copied ${src} -> ${dest}`);

      return config;
    },
  ]);
};
