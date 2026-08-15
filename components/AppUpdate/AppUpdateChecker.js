import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  checkForAndroidUpdate,
  downloadAndOpenAndroidUpdate,
} from "../../services/appUpdateService";

let activeUpdateCheck = null;

const runUpdateCheck = () => {
  if (!activeUpdateCheck) {
    activeUpdateCheck = checkForAndroidUpdate().finally(() => {
      activeUpdateCheck = null;
    });
  }
  return activeUpdateCheck;
};

export default function AppUpdateChecker() {
  const hasChecked = useRef(false);
  const isDownloading = useRef(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSize, setDownloadSize] = useState(0);
  const [isDownloadModalVisible, setDownloadModalVisible] = useState(false);

  const startDownload = useCallback(async (release) => {
    if (isDownloading.current) return;

    isDownloading.current = true;
    setDownloadProgress(0);
    setDownloadSize(release.sizeBytes || 0);
    setDownloadModalVisible(true);

    try {
      await downloadAndOpenAndroidUpdate(release, (progress) => {
        setDownloadProgress(progress);
        if (progress >= 1) setDownloadModalVisible(false);
      });
      setDownloadModalVisible(false);
    } catch (error) {
      setDownloadModalVisible(false);
      Alert.alert(
        "Не вдалося завантажити оновлення",
        error?.message || "Сталася невідома помилка."
      );
    } finally {
      isDownloading.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || hasChecked.current) return undefined;

    hasChecked.current = true;
    let cancelled = false;

    runUpdateCheck().then((result) => {
      if (cancelled || !result.updateAvailable || !result.release) return;

      const { currentBuild, latestBuild, release } = result;
      const versionLabel = release.versionName.trim()
        ? release.versionName
        : `збірка ${latestBuild}`;
      const message =
        `Доступна нова версія FoEChat: ${versionLabel}.\n\n` +
        `Поточна збірка: ${currentBuild}.\n` +
        `Нова збірка: ${latestBuild}.\n\n` +
        release.releaseNotes;

      Alert.alert("Доступне оновлення", message, [
        { text: "Пізніше", style: "cancel" },
        {
          text: "Оновити",
          onPress: () => startDownload(release),
        },
      ]);
    });

    return () => {
      cancelled = true;
    };
  }, [startDownload]);

  const percentage = Math.round(downloadProgress * 100);
  const sizeLabel = downloadSize > 0
    ? `${(downloadSize / (1024 * 1024)).toFixed(1)} МБ`
    : "";

  return (
    <Modal
      animationType="fade"
      transparent
      visible={isDownloadModalVisible}
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>Завантаження оновлення</Text>
          <Text style={styles.percentage}>{percentage}%</Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${percentage}%` }]}
            />
          </View>
          {sizeLabel ? (
            <Text style={styles.size}>Розмір APK: {sizeLabel}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    backgroundColor: "#1b1f27",
    padding: 24,
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  percentage: {
    color: "#ffffff",
    fontSize: 18,
    marginTop: 18,
    textAlign: "center",
  },
  progressTrack: {
    height: 10,
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "#3a404c",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#4f8cff",
  },
  size: {
    color: "#c8ced8",
    fontSize: 14,
    marginTop: 14,
    textAlign: "center",
  },
});
