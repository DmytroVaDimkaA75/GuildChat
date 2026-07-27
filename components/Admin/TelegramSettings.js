import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from '@react-native-firebase/app';
import database from '@react-native-firebase/database';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GuildContext } from '../../GuildContext';

const FUNCTIONS_REGION = 'europe-west1';

const callTelegramFunction = async (name, data) => {
  const functionsInstance = getFunctions(getApp(), FUNCTIONS_REGION);
  const callable = httpsCallable(functionsInstance, name);
  const result = await callable(data);
  return result?.data || {};
};

const formatRemainingTime = (remainingMs) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const TelegramSettings = () => {
  const { t } = useTranslation();
  const { guildId: contextGuildId } = useContext(GuildContext);
  const [activeGuildId, setActiveGuildId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [telegramSetting, setTelegramSetting] = useState(null);
  const [binding, setBinding] = useState(null);
  const [action, setAction] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const activeGuildRef = useRef('');

  useFocusEffect(
    useCallback(() => {
      let disposed = false;
      let settingRef;

      setIsLoading(true);
      setBinding(null);
      activeGuildRef.current = '';

      const subscribe = async () => {
        try {
          const [storedGuildId, userId] = await Promise.all([
            AsyncStorage.getItem('guildId'),
            AsyncStorage.getItem('userId'),
          ]);
          if (disposed) return;

          const guildId = String(contextGuildId || storedGuildId || '').trim();
          const normalizedUserId = String(userId || '').trim();
          activeGuildRef.current = guildId;
          setActiveGuildId(guildId);
          setCurrentUserId(normalizedUserId);

          if (!guildId || !normalizedUserId) {
            setTelegramSetting(null);
            setIsLoading(false);
            return;
          }

          settingRef = database().ref(
            `/guilds/${guildId}/setting/telegram`
          );
          settingRef.on(
            'value',
            snapshot => {
              if (disposed) return;
              const value = snapshot.exists() ? snapshot.val() || {} : null;
              setTelegramSetting(value);
              setBinding(previous => {
                if (value?.status === 'connected') return null;
                const pendingRequestId = String(
                  value?.pendingBinding?.requestId || ''
                );
                if (
                  previous?.requestId &&
                  previous.requestId !== pendingRequestId
                ) {
                  return null;
                }
                return previous;
              });
              setIsLoading(false);
            },
            error => {
              if (disposed) return;
              console.error('Помилка завантаження Telegram-налаштувань:', error);
              setTelegramSetting(null);
              setBinding(null);
              setIsLoading(false);
            }
          );
        } catch (error) {
          if (disposed) return;
          console.error('Помилка ініціалізації Telegram-налаштувань:', error);
          setTelegramSetting(null);
          setBinding(null);
          setIsLoading(false);
        }
      };

      subscribe();

      return () => {
        disposed = true;
        activeGuildRef.current = '';
        if (settingRef) settingRef.off('value');
      };
    }, [contextGuildId])
  );

  useEffect(() => {
    if (!binding?.expiresAt) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [binding?.expiresAt]);

  const pendingBinding = telegramSetting?.pendingBinding || null;
  const isConnected = telegramSetting?.status === 'connected';
  const hasConnectionError =
    telegramSetting?.status === 'error' && !pendingBinding;
  const remainingMs = Number(binding?.expiresAt || 0) - now;
  const isCodeExpired = !!binding?.expiresAt && remainingMs <= 0;
  const command = String(binding?.command || '').trim();

  const channelLabel = useMemo(() => {
    const title = String(telegramSetting?.chatTitle || '').trim();
    const username = String(telegramSetting?.chatUsername || '').trim();
    if (title) return title;
    if (username) return `@${username}`;
    return t('guildAdmin.telegram.channelFallback');
  }, [t, telegramSetting?.chatTitle, telegramSetting?.chatUsername]);

  const getErrorMessage = useCallback(
    (errorCode, retryAfterMs = 0) => {
      switch (String(errorCode || '')) {
        case 'PERMISSION_DENIED':
          return t('guildAdmin.telegram.permissionDenied');
        case 'TELEGRAM_NOT_CONFIGURED':
          return t('guildAdmin.telegram.botNotConfigured');
        case 'WEBHOOK_URL_UNAVAILABLE':
          return t('guildAdmin.telegram.webhookUnavailable');
        case 'BOT_NOT_ADMIN':
          return t('guildAdmin.telegram.botNotAdmin');
        case 'CHANNEL_ALREADY_BOUND':
          return t('guildAdmin.telegram.alreadyBound');
        case 'WRONG_BOT':
          return t('guildAdmin.telegram.wrongBot');
        case 'BOT_ACCESS_LOST':
        case 'CHANNEL_UNAVAILABLE':
        case 'NOT_CONNECTED':
          return t('guildAdmin.telegram.connectionLost');
        case 'CODE_EXPIRED':
          return t('guildAdmin.telegram.codeExpired');
        case 'BINDING_BUSY':
          return t('guildAdmin.telegram.bindingBusy');
        case 'TOO_SOON':
          return t('guildAdmin.telegram.tooSoon', {
            seconds: Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000)),
          });
        case 'TELEGRAM_RATE_LIMITED':
        case 'TELEGRAM_UNAVAILABLE':
          return t('guildAdmin.telegram.telegramUnavailable');
        default:
          return t('guildAdmin.telegram.genericError');
      }
    },
    [t]
  );

  const showFunctionError = useCallback(
    (result, fallbackKey) => {
      Alert.alert(
        t('guildAdmin.telegram.errorTitle'),
        result?.error
          ? getErrorMessage(result.error, result.retryAfterMs)
          : t(fallbackKey)
      );
    },
    [getErrorMessage, t]
  );

  const handleCreateBinding = async () => {
    if (action || !activeGuildId || !currentUserId) return;
    const requestGuildId = activeGuildId;
    setAction('prepare');
    try {
      const result = await callTelegramFunction(
        'createTelegramBindingCode',
        {
          guildId: activeGuildId,
          userId: currentUserId,
        }
      );
      if (!result?.success) {
        showFunctionError(result, 'guildAdmin.telegram.setupFailed');
        return;
      }
      if (activeGuildRef.current !== requestGuildId) return;

      setBinding({
        requestId: String(result.requestId || ''),
        code: String(result.code || ''),
        command: String(result.command || ''),
        botUsername: String(result.botUsername || ''),
        expiresAt: Number(result.expiresAt || 0),
        addChannelUrl: String(result.addChannelUrl || ''),
      });
      setNow(Date.now());
    } catch (error) {
      console.error('Помилка створення Telegram-коду:', error);
      Alert.alert(
        t('guildAdmin.telegram.errorTitle'),
        t('guildAdmin.telegram.setupFailed')
      );
    } finally {
      setAction(null);
    }
  };

  const handleCopyCommand = async () => {
    if (!command) return;
    try {
      await Clipboard.setStringAsync(command);
      Alert.alert(
        t('guildAdmin.telegram.copiedTitle'),
        t('guildAdmin.telegram.copiedMessage')
      );
    } catch {
      Alert.alert(
        t('guildAdmin.telegram.errorTitle'),
        t('guildAdmin.telegram.genericError')
      );
    }
  };

  const handleAddBot = async () => {
    const botUsername = String(
      binding?.botUsername || pendingBinding?.botUsername || ''
    ).replace(/^@/, '');
    const url =
      binding?.addChannelUrl ||
      (botUsername
        ? `https://t.me/${botUsername}?startchannel&admin=post_messages`
        : '');
    if (!url) return;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        t('guildAdmin.telegram.errorTitle'),
        t('guildAdmin.telegram.openBotFailed')
      );
    }
  };

  const handleTest = async () => {
    if (action || !activeGuildId || !currentUserId) return;
    setAction('test');
    try {
      const result = await callTelegramFunction(
        'testTelegramGuildConnection',
        {
          guildId: activeGuildId,
          userId: currentUserId,
        }
      );
      if (!result?.success) {
        showFunctionError(result, 'guildAdmin.telegram.testFailed');
        return;
      }
      Alert.alert(
        t('guildAdmin.telegram.testSentTitle'),
        t('guildAdmin.telegram.testSentMessage')
      );
    } catch (error) {
      console.error('Помилка тесту Telegram:', error);
      Alert.alert(
        t('guildAdmin.telegram.errorTitle'),
        t('guildAdmin.telegram.testFailed')
      );
    } finally {
      setAction(null);
    }
  };

  const disconnect = async () => {
    setAction('disconnect');
    try {
      const result = await callTelegramFunction('disconnectTelegramGuild', {
        guildId: activeGuildId,
        userId: currentUserId,
      });
      if (!result?.success) {
        showFunctionError(result, 'guildAdmin.telegram.disconnectFailed');
        return;
      }
      setBinding(null);
      Alert.alert(
        t('guildAdmin.telegram.disconnectedTitle'),
        t('guildAdmin.telegram.disconnectedMessage')
      );
    } catch (error) {
      console.error('Помилка відключення Telegram:', error);
      Alert.alert(
        t('guildAdmin.telegram.errorTitle'),
        t('guildAdmin.telegram.disconnectFailed')
      );
    } finally {
      setAction(null);
    }
  };

  const handleDisconnect = () => {
    if (action || !activeGuildId || !currentUserId) return;
    Alert.alert(
      t('guildAdmin.telegram.disconnectTitle'),
      t('guildAdmin.telegram.disconnectMessage'),
      [
        {
          text: t('guildAdmin.telegram.cancel'),
          style: 'cancel',
        },
        {
          text: t('guildAdmin.telegram.disconnectConfirm'),
          style: 'destructive',
          onPress: disconnect,
        },
      ]
    );
  };

  const renderActionContent = (actionName, labelKey) =>
    action === actionName ? (
      <ActivityIndicator size="small" color="#fff" />
    ) : (
      <Text style={styles.buttonText}>{t(labelKey)}</Text>
    );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {t('guildAdmin.telegram.title')}
      </Text>
      <Text style={styles.description}>
        {t('guildAdmin.telegram.description')}
      </Text>

      {isLoading ? (
        <ActivityIndicator
          style={styles.loading}
          size="small"
          color="#4ea1ff"
        />
      ) : isConnected ? (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, styles.statusDotConnected]} />
            <Text style={styles.connectedText}>
              {t('guildAdmin.telegram.connected')}
            </Text>
          </View>
          <Text style={styles.channelTitle}>{channelLabel}</Text>
          {!!telegramSetting?.chatUsername && (
            <Text style={styles.channelUsername}>
              @{telegramSetting.chatUsername}
            </Text>
          )}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.flexButton,
                action && styles.disabledButton,
              ]}
              onPress={handleTest}
              disabled={!!action}
              activeOpacity={0.8}
            >
              {renderActionContent('test', 'guildAdmin.telegram.test')}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dangerButton,
                styles.flexButton,
                action && styles.disabledButton,
              ]}
              onPress={handleDisconnect}
              disabled={!!action}
              activeOpacity={0.8}
            >
              {renderActionContent(
                'disconnect',
                'guildAdmin.telegram.disconnect'
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : hasConnectionError ? (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, styles.statusDotError]} />
            <Text style={styles.errorText}>
              {t('guildAdmin.telegram.connectionError')}
            </Text>
          </View>
          <Text style={styles.channelTitle}>{channelLabel}</Text>
          <Text style={styles.warningText}>
            {getErrorMessage(telegramSetting?.errorCode)}
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.flexButton,
                action && styles.disabledButton,
              ]}
              onPress={handleCreateBinding}
              disabled={!!action}
              activeOpacity={0.8}
            >
              {renderActionContent(
                'prepare',
                'guildAdmin.telegram.reconnect'
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dangerButton,
                styles.flexButton,
                action && styles.disabledButton,
              ]}
              onPress={handleDisconnect}
              disabled={!!action}
              activeOpacity={0.8}
            >
              {renderActionContent(
                'disconnect',
                'guildAdmin.telegram.disconnect'
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : binding && !isCodeExpired ? (
        <>
          {pendingBinding?.errorCode ? (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, styles.statusDotError]} />
              <Text style={styles.errorText}>
                {getErrorMessage(pendingBinding.errorCode)}
              </Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#4ea1ff" />
              <Text style={styles.waitingText}>
                {t('guildAdmin.telegram.waiting')}
              </Text>
            </View>
          )}

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>
              {t('guildAdmin.telegram.stepCreateChannel')}
            </Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>
              {t('guildAdmin.telegram.stepAddBot')}
            </Text>
          </View>
          <Text style={styles.botName}>
            {t('guildAdmin.telegram.botLabel')}: @{binding.botUsername}
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleAddBot}
            activeOpacity={0.8}
          >
            <Ionicons name="paper-plane-outline" size={18} color="#4ea1ff" />
            <Text style={styles.secondaryButtonText}>
              {t('guildAdmin.telegram.addBot')}
            </Text>
          </TouchableOpacity>

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepText}>
              {t('guildAdmin.telegram.stepPublishCommand')}
            </Text>
          </View>
          <Text style={styles.commandLabel}>
            {t('guildAdmin.telegram.commandLabel')}
          </Text>
          <TouchableOpacity
            style={styles.commandRow}
            onPress={handleCopyCommand}
            activeOpacity={0.8}
          >
            <Text selectable style={styles.commandText}>
              {command}
            </Text>
            <Ionicons name="copy-outline" size={20} color="#4ea1ff" />
          </TouchableOpacity>
          <Text style={styles.expiryText}>
            {t('guildAdmin.telegram.expiresIn', {
              time: formatRemainingTime(remainingMs),
            })}
          </Text>
        </>
      ) : binding && isCodeExpired ? (
        <>
          <Text style={styles.errorText}>
            {t('guildAdmin.telegram.codeExpired')}
          </Text>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              action && styles.disabledButton,
            ]}
            onPress={handleCreateBinding}
            disabled={!!action}
            activeOpacity={0.8}
          >
            {renderActionContent(
              'prepare',
              'guildAdmin.telegram.newCode'
            )}
          </TouchableOpacity>
        </>
      ) : pendingBinding ? (
        <>
          <Text style={styles.warningText}>
            {t('guildAdmin.telegram.pendingCodeLost')}
          </Text>
          {!!pendingBinding?.errorCode && (
            <Text style={styles.errorText}>
              {getErrorMessage(pendingBinding.errorCode)}
            </Text>
          )}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              action && styles.disabledButton,
            ]}
            onPress={handleCreateBinding}
            disabled={!!action}
            activeOpacity={0.8}
          >
            {renderActionContent(
              'prepare',
              'guildAdmin.telegram.newCode'
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.disconnectedText}>
            {t('guildAdmin.telegram.disconnected')}
          </Text>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              action && styles.disabledButton,
            ]}
            onPress={handleCreateBinding}
            disabled={!!action}
            activeOpacity={0.8}
          >
            {renderActionContent(
              'prepare',
              'guildAdmin.telegram.connect'
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#A0D8FF',
    marginBottom: 6,
  },
  description: {
    color: '#C7C7CC',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  loading: {
    marginVertical: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusDotConnected: {
    backgroundColor: '#34c759',
  },
  statusDotError: {
    backgroundColor: '#ff5b5b',
  },
  connectedText: {
    color: '#7ee787',
    fontSize: 14,
    fontWeight: '700',
  },
  disconnectedText: {
    color: '#9aa3b2',
    fontSize: 14,
    lineHeight: 20,
  },
  channelTitle: {
    color: '#f4f7fb',
    fontSize: 17,
    fontWeight: '700',
  },
  channelUsername: {
    color: '#9aa3b2',
    fontSize: 13,
    marginTop: 3,
  },
  waitingText: {
    color: '#A0D8FF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 9,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,161,255,0.18)',
    marginRight: 10,
  },
  stepNumberText: {
    color: '#4ea1ff',
    fontWeight: '800',
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    color: '#E0E0E0',
    fontSize: 14,
    lineHeight: 20,
  },
  botName: {
    color: '#A0D8FF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 34,
    marginTop: 7,
  },
  commandLabel: {
    color: '#9aa3b2',
    fontSize: 12,
    marginTop: 12,
  },
  commandRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: 'rgba(78,161,255,0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  commandText: {
    flex: 1,
    color: '#f4f7fb',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginRight: 10,
  },
  expiryText: {
    color: '#9aa3b2',
    fontSize: 12,
    marginTop: 8,
  },
  warningText: {
    color: '#f1c75b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  errorText: {
    color: '#ff7b72',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  flexButton: {
    flex: 1,
  },
  primaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,161,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(78,161,255,0.35)',
    borderRadius: 10,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#4ea1ff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  dangerButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8f2f35',
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default TelegramSettings;
