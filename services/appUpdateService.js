import database from "@react-native-firebase/database";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

const STABLE_ANDROID_RELEASE_PATH = "appReleases/android/stable";
const APK_MIME_TYPE = "application/vnd.android.package-archive";
const ACTION_VIEW = "android.intent.action.VIEW";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

const normalizeString = (value) =>
  typeof value === "string" ? value : "";

const normalizeNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

/**
 * Returns the native Android build number, or 0 on non-Android platforms.
 *
 * @returns {number}
 */
export function getCurrentAndroidBuild() {
  if (Platform.OS !== "android") return 0;

  const build = Number(Application.nativeBuildVersion);
  return Number.isInteger(build) && build > 0 ? build : 0;
}

/**
 * Fetches and normalizes the currently published stable Android release.
 *
 * @returns {Promise<null | {
 *   build: number,
 *   versionName: string,
 *   fileName: string,
 *   storagePath: string,
 *   downloadUrl: string,
 *   sizeBytes: number,
 *   releaseNotes: string,
 *   mandatory: boolean,
 *   publishedAt: number
 * }>}
 */
export async function fetchStableAndroidRelease() {
  const snapshot = await database()
    .ref(STABLE_ANDROID_RELEASE_PATH)
    .once("value");

  if (!snapshot.exists()) return null;

  const value = snapshot.val() || {};
  const build = Number(value.build);

  if (!Number.isInteger(build) || build <= 0) {
    throw new Error("Stable Android release has an invalid build number.");
  }

  return {
    build,
    versionName: normalizeString(value.versionName),
    fileName: normalizeString(value.fileName),
    storagePath: normalizeString(value.storagePath),
    downloadUrl: normalizeString(value.downloadUrl),
    sizeBytes: normalizeNonNegativeNumber(value.sizeBytes),
    releaseNotes: normalizeString(value.releaseNotes),
    mandatory: value.mandatory === true,
    publishedAt: normalizeNonNegativeNumber(value.publishedAt),
  };
}

/**
 * Checks whether Firebase contains a newer stable Android build.
 *
 * @returns {Promise<{
 *   updateAvailable: boolean,
 *   currentBuild: number,
 *   latestBuild: number,
 *   release: object | null,
 *   error: unknown | null
 * }>}
 */
export async function checkForAndroidUpdate() {
  const currentBuild = getCurrentAndroidBuild();

  try {
    const release = await fetchStableAndroidRelease();
    const latestBuild = release?.build || 0;

    return {
      updateAvailable: latestBuild > currentBuild,
      currentBuild,
      latestBuild,
      release,
      error: null,
    };
  } catch (error) {
    console.error("Failed to check for an Android update:", error);
    return {
      updateAvailable: false,
      currentBuild,
      latestBuild: 0,
      release: null,
      error,
    };
  }
}

const getCachedAndroidUpdateUri = (build) => {
  if (!FileSystem.cacheDirectory) {
    throw new Error("Не вдалося визначити каталог кешу застосунку.");
  }
  return `${FileSystem.cacheDirectory}FoEChat-update-${build}.apk`;
};

/**
 * Downloads an Android APK to the app cache and opens the system installer.
 *
 * @param {{ build: number, downloadUrl: string, sizeBytes?: number }} release
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<{ localUri: string, contentUri: string, sizeBytes: number }>}
 */
export async function downloadAndOpenAndroidUpdate(release, onProgress) {
  if (Platform.OS !== "android") {
    throw new Error("Встановлення оновлення доступне лише на Android.");
  }

  const build = Number(release?.build);
  if (!Number.isInteger(build) || build <= 0) {
    throw new Error("Некоректний номер збірки оновлення.");
  }

  let downloadUrl;
  try {
    downloadUrl = new URL(release?.downloadUrl);
  } catch (_error) {
    throw new Error("Некоректне посилання для завантаження оновлення.");
  }
  if (downloadUrl.protocol !== "https:") {
    throw new Error("Оновлення можна завантажувати лише через HTTPS.");
  }

  const localUri = getCachedAndroidUpdateUri(build);
  const reportProgress = (progress) => {
    if (typeof onProgress === "function") {
      onProgress(Math.min(1, Math.max(0, progress)));
    }
  };

  try {
    reportProgress(0);
    await FileSystem.deleteAsync(localUri, { idempotent: true });

    const download = FileSystem.createDownloadResumable(
      downloadUrl.toString(),
      localUri,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        if (totalBytesExpectedToWrite > 0) {
          reportProgress(
            Math.min(0.99, totalBytesWritten / totalBytesExpectedToWrite)
          );
        }
      }
    );
    const result = await download.downloadAsync();

    if (!result?.uri) {
      throw new Error("Завантаження APK не було завершене.");
    }

    const fileInfo = await FileSystem.getInfoAsync(localUri);
    const actualSize = Number(fileInfo.exists ? fileInfo.size : 0);
    if (!fileInfo.exists || !Number.isFinite(actualSize) || actualSize <= 0) {
      throw new Error("Завантажений APK відсутній або порожній.");
    }

    const expectedSize = Number(release?.sizeBytes);
    if (
      Number.isFinite(expectedSize) &&
      expectedSize > 0 &&
      actualSize !== expectedSize
    ) {
      throw new Error("Розмір завантаженого APK не відповідає опублікованому.");
    }

    const contentUri = await FileSystem.getContentUriAsync(localUri);
    if (!contentUri.startsWith("content://")) {
      throw new Error("Не вдалося безпечно передати APK системному інсталятору.");
    }

    reportProgress(1);
    await IntentLauncher.startActivityAsync(ACTION_VIEW, {
      data: contentUri,
      type: APK_MIME_TYPE,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });

    return { localUri, contentUri, sizeBytes: actualSize };
  } catch (error) {
    if (error instanceof Error && /[А-Яа-яІіЇїЄє]/.test(error.message)) {
      throw error;
    }
    throw new Error(
      `Не вдалося завантажити або відкрити APK: ${error?.message || String(error)}`
    );
  }
}

/**
 * Removes a cached Android update APK for the provided build number.
 *
 * @param {number} build
 * @returns {Promise<void>}
 */
export async function removeCachedAndroidUpdate(build) {
  const normalizedBuild = Number(build);
  if (!Number.isInteger(normalizedBuild) || normalizedBuild <= 0) {
    throw new Error("Некоректний номер збірки для очищення кешу.");
  }

  const localUri = getCachedAndroidUpdateUri(normalizedBuild);
  try {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    }
  } catch (error) {
    throw new Error(
      `Не вдалося видалити APK із кешу: ${error?.message || String(error)}`
    );
  }
}
