import { Ionicons } from '@expo/vector-icons';
import { faClock, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ЕДИНСТВЕННЫЙ ПРАВИЛЬНЫЙ ИМПОРТ
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// import { database } from '../../firebaseConfig'; // УДАЛЕНО
import { getUkrainianRoleLabel } from '../../constants/roles';
import { DarkThemeColors } from '../../constants/theme';
import {
  authenticateLegacyAccount,
  getGoogleLinkStatus,
  isGoogleAuthCancellation,
  linkGoogleAccount,
  unlinkGoogleAccount,
} from '../../src/auth/googleAuth';

const normalizeGoogleStatus = (value, expectedUserId = '') => {
  const userId = String(value?.userId || '').trim();
  const normalizedExpectedUserId = String(expectedUserId || '').trim();

  if (!userId || (normalizedExpectedUserId && userId !== normalizedExpectedUserId)) {
    const error = new Error('Google link status belongs to another user.');
    error.code = 'google/user-mismatch';
    throw error;
  }

  return {
    userId,
    linked: value?.linked === true,
    email: String(value?.email || '').trim(),
    displayName: String(value?.displayName || '').trim(),
  };
};

const ProfileMain = () => {
  const { t } = useTranslation();
  const [userName, setUserName] = useState('');
  const [activeWorld, setActiveWorld] = useState('');
  const [guilds, setGuilds] = useState([]);
  const [googleStatus, setGoogleStatus] = useState('loading');
  const [googleAccount, setGoogleAccount] = useState(null);
  const [verificationAction, setVerificationAction] = useState(null);
  const [accessCode, setAccessCode] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);

  const isMountedRef = useRef(true);
  const googleStatusRequestRef = useRef(0);
  const statusBeforeVerificationRef = useRef('verification-required');

  const navigation = useNavigation();

  const convertRole = getUkrainianRoleLabel;

  const applyGoogleStatus = useCallback((value, expectedUserId = '') => {
    const normalizedStatus = normalizeGoogleStatus(value, expectedUserId);
    setGoogleAccount(normalizedStatus);
    setGoogleStatus(normalizedStatus.linked ? 'linked' : 'unlinked');
    return normalizedStatus;
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    const requestId = googleStatusRequestRef.current + 1;
    googleStatusRequestRef.current = requestId;
    setGoogleStatus('loading');

    try {
      const expectedUserId = String(
        (await AsyncStorage.getItem('userId')) || ''
      ).trim();
      if (!expectedUserId) {
        const error = new Error('Current user is missing.');
        error.code = 'google/session-required';
        throw error;
      }
      const result = await getGoogleLinkStatus();
      if (!isMountedRef.current || googleStatusRequestRef.current !== requestId) return;
      applyGoogleStatus(result, expectedUserId);
    } catch (error) {
      if (!isMountedRef.current || googleStatusRequestRef.current !== requestId) return;
      setGoogleAccount(null);
      setGoogleStatus(
        error?.code === 'google/session-required' ||
        error?.code === 'google/user-mismatch'
          ? 'verification-required'
          : 'error'
      );
    }
  }, [applyGoogleStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    if (Platform.OS === 'android') {
      loadGoogleStatus();
    }

    return () => {
      isMountedRef.current = false;
      googleStatusRequestRef.current += 1;
    };
  }, [loadGoogleStatus]);

  useEffect(() => {
    const listeners = [];

    const fetchInitialData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');

        if (userId) {
          const userNameRef = database().ref(`/users/${userId}/userName`);
          const onUserNameUpdate = snap => snap.exists() && setUserName(snap.val());
          userNameRef.on('value', onUserNameUpdate);
          listeners.push({ ref: userNameRef, callback: onUserNameUpdate });
        }

        if (guildId) {
          const worldNameRef = database().ref(`/guilds/${guildId}/worldName`);
          const onWorldNameUpdate = snap => snap.exists() && setActiveWorld(snap.val());
          worldNameRef.on('value', onWorldNameUpdate);
          listeners.push({ ref: worldNameRef, callback: onWorldNameUpdate });
        }
        
      } catch (e) {
        console.error(e);
      }
    };

    const fetchGuilds = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!userId) return;
        // ИЗМЕНЕНО
        const snap = await database()
          .ref(`/users/${userId}/userGuilds`)
          .once('value');
        if (!snap.exists()) return;
        const userGuilds = snap.val() || {};
        const keys = Object.keys(userGuilds);
        const arr = await Promise.all(
          keys.map(async id => {
            const role = userGuilds[id].role;
            // ИЗМЕНЕНО
            const worldSnap = await database().ref(`/guilds/${id}/worldName`).once('value');
            return { guildId: id, role, worldName: worldSnap.val() || 'Не знайдено' };
          })
        );
        setGuilds(arr);
      } catch (e) {
        console.error(e);
      }
    };

    fetchInitialData();
    fetchGuilds();

    // Функция отписки от слушателей
    return () => {
      listeners.forEach(({ ref, callback }) => ref.off('value', callback));
    };
  }, []);

  const resetVerificationModal = () => {
    setVerificationAction(null);
    setAccessCode('');
  };

  const openVerificationModal = action => {
    if (verificationBusy || googleStatus === 'loading') return;
    statusBeforeVerificationRef.current = ['linked', 'unlinked'].includes(googleStatus)
      ? googleStatus
      : 'verification-required';
    setAccessCode('');
    setVerificationAction(action);
    setGoogleStatus('verification-required');
  };

  const closeVerificationModal = () => {
    if (verificationBusy) return;
    resetVerificationModal();
    setGoogleStatus(statusBeforeVerificationRef.current);
  };

  const handleVerificationSubmit = async () => {
    if (!verificationAction || verificationBusy) return;

    const normalizedAccessCode = accessCode.trim();
    if (!normalizedAccessCode) {
      Alert.alert(
        t('googleAuth.errorTitle'),
        t('googleAuth.accessCodeRequired')
      );
      return;
    }

    const action = verificationAction;
    let stage = 'authentication';
    let verifiedStatus = null;
    let committedStatus = null;
    setVerificationBusy(true);

    try {
      const expectedUserId = String(
        (await AsyncStorage.getItem('userId')) || ''
      ).trim();
      if (!expectedUserId) {
        const error = new Error('Current user is missing.');
        error.code = 'google/user-missing';
        throw error;
      }

      const authenticatedAccount = await authenticateLegacyAccount({
        accessCode: normalizedAccessCode,
        expectedUserId,
      });
      if (String(authenticatedAccount?.userId || '').trim() !== expectedUserId) {
        const error = new Error('Authenticated account does not match the current user.');
        error.code = 'google/user-mismatch';
        throw error;
      }

      stage = 'status';
      verifiedStatus = normalizeGoogleStatus(
        await getGoogleLinkStatus(),
        expectedUserId
      );

      if (action === 'link' && !verifiedStatus.linked) {
        stage = 'link';
        committedStatus = normalizeGoogleStatus(
          await linkGoogleAccount(),
          expectedUserId
        );
      } else if (action === 'unlink' && verifiedStatus.linked) {
        stage = 'unlink';
        committedStatus = normalizeGoogleStatus(
          await unlinkGoogleAccount({ accessCode: normalizedAccessCode }),
          expectedUserId
        );
      }

      stage = action;
      const finalStatus = normalizeGoogleStatus(
        await getGoogleLinkStatus(),
        expectedUserId
      );
      if (
        (action === 'link' && !finalStatus.linked) ||
        (action === 'unlink' && finalStatus.linked)
      ) {
        const error = new Error('Google link state was not updated.');
        error.code = 'google/status-not-updated';
        throw error;
      }

      if (!isMountedRef.current) return;
      applyGoogleStatus(finalStatus, expectedUserId);
      resetVerificationModal();
    } catch (error) {
      if (!isMountedRef.current) return;

      if (committedStatus) {
        applyGoogleStatus(committedStatus, committedStatus.userId);
        resetVerificationModal();
        Alert.alert(
          t('googleAuth.errorTitle'),
          t('googleAuth.statusRefreshFailed')
        );
        return;
      }

      if (isGoogleAuthCancellation(error)) {
        if (verifiedStatus) {
          applyGoogleStatus(verifiedStatus, verifiedStatus.userId);
        } else {
          setGoogleStatus(statusBeforeVerificationRef.current);
        }
        resetVerificationModal();
        return;
      }

      setAccessCode('');
      setGoogleStatus('verification-required');
      const errorKey = stage === 'authentication'
        ? 'googleAuth.authenticationFailed'
        : action === 'unlink'
          ? 'googleAuth.unlinkFailed'
          : 'googleAuth.linkFailed';
      Alert.alert(t('googleAuth.errorTitle'), t(errorKey));
    } finally {
      if (isMountedRef.current) setVerificationBusy(false);
    }
  };

  const handleUnlinkPress = () => {
    if (verificationBusy || googleStatus !== 'linked') return;
    Alert.alert(
      t('googleAuth.unlinkTitle'),
      t('googleAuth.unlinkMessage'),
      [
        { text: t('googleAuth.cancel'), style: 'cancel' },
        {
          text: t('googleAuth.unlinkConfirm'),
          style: 'destructive',
          onPress: () => openVerificationModal('unlink'),
        },
      ]
    );
  };

  const renderGoogleButtonContent = (iconName, labelKey) => (
    verificationBusy ? (
      <ActivityIndicator size="small" color="#fff" />
    ) : (
      <>
        <Ionicons name={iconName} size={19} color="#fff" />
        <Text style={styles.googleButtonText}>{t(labelKey)}</Text>
      </>
    )
  );

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Шапка */}
        <View style={styles.header}>
          <Text style={styles.userName}>{userName}</Text>
        </View>

        {/* Ігрові світи */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ігрові світи</Text>
          {guilds.length ? (
            guilds.map(g => (
              <View key={g.guildId} style={styles.itemRowNoBorder}>
                <View style={styles.rowContent}>
                  <Text style={styles.mainText}>{g.worldName}</Text>
                  {g.worldName === activeWorld && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={DarkThemeColors.primary}
                    style={styles.iconSpacing}
                  />
                  )}
                </View>
                <Text style={styles.mainText}>{convertRole(g.role)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.mainText}>Дані не знайдено</Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Про себе */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Про себе</Text>
          <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('ProfileData')}>
            <Text style={styles.mainText}>Я користувач</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {Platform.OS === 'android' && (
          <>
        {/* Google */}
        <View style={styles.section}>
          <View style={styles.googleHeader}>
            <View style={styles.googleIcon}>
              <Ionicons name="logo-google" size={22} color={DarkThemeColors.primary} />
            </View>
            <Text style={[styles.sectionTitle, styles.googleSectionTitle]}>
              {t('googleAuth.title')}
            </Text>
          </View>
          <Text style={styles.googleDescription}>{t('googleAuth.description')}</Text>

          {googleStatus === 'loading' && (
            <View style={styles.googleLoadingRow}>
              <ActivityIndicator size="small" color={DarkThemeColors.primary} />
              <Text style={styles.googleLoadingText}>{t('googleAuth.loading')}</Text>
            </View>
          )}

          {googleStatus === 'verification-required' && (
            <>
              <View style={styles.googleStatusRow}>
                <Ionicons name="shield-checkmark-outline" size={19} color={DarkThemeColors.warning} />
                <Text style={[styles.googleStatusText, styles.googleWarningText]}>
                  {t('googleAuth.verificationRequired')}
                </Text>
              </View>
              {!verificationAction && (
                <TouchableOpacity
                  style={styles.googlePrimaryButton}
                  onPress={() => openVerificationModal('link')}
                  disabled={verificationBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t('googleAuth.link')}
                  accessibilityState={{ disabled: verificationBusy }}
                  activeOpacity={0.8}
                >
                  {renderGoogleButtonContent('logo-google', 'googleAuth.link')}
                </TouchableOpacity>
              )}
            </>
          )}

          {googleStatus === 'unlinked' && (
            <>
              <View style={styles.googleStatusRow}>
                <Ionicons name="unlink-outline" size={19} color={DarkThemeColors.textSecondary} />
                <Text style={styles.googleStatusText}>{t('googleAuth.unlinked')}</Text>
              </View>
              <TouchableOpacity
                style={styles.googlePrimaryButton}
                onPress={() => openVerificationModal('link')}
                disabled={verificationBusy}
                accessibilityRole="button"
                accessibilityLabel={t('googleAuth.link')}
                accessibilityState={{ disabled: verificationBusy }}
                activeOpacity={0.8}
              >
                {renderGoogleButtonContent('logo-google', 'googleAuth.link')}
              </TouchableOpacity>
            </>
          )}

          {googleStatus === 'linked' && (
            <>
              <View style={styles.googleStatusRow}>
                <Ionicons name="checkmark-circle" size={19} color={DarkThemeColors.success} />
                <Text style={[styles.googleStatusText, styles.googleLinkedText]}>
                  {t('googleAuth.linked')}
                </Text>
              </View>
              {!!googleAccount?.displayName && (
                <Text style={styles.googleAccountName}>{googleAccount.displayName}</Text>
              )}
              <Text style={styles.googleAccountEmail} numberOfLines={1}>
                {googleAccount?.email || t('googleAuth.emailFallback')}
              </Text>
              <TouchableOpacity
                style={styles.googleDangerButton}
                onPress={handleUnlinkPress}
                disabled={verificationBusy}
                accessibilityRole="button"
                accessibilityLabel={t('googleAuth.unlink')}
                accessibilityState={{ disabled: verificationBusy }}
                activeOpacity={0.8}
              >
                <Ionicons name="unlink-outline" size={19} color={DarkThemeColors.danger} />
                <Text style={styles.googleDangerButtonText}>{t('googleAuth.unlink')}</Text>
              </TouchableOpacity>
            </>
          )}

          {googleStatus === 'error' && (
            <>
              <View style={styles.googleStatusRow}>
                <Ionicons name="alert-circle-outline" size={19} color={DarkThemeColors.danger} />
                <Text style={[styles.googleStatusText, styles.googleErrorText]}>
                  {t('googleAuth.loadFailed')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.googleSecondaryButton}
                onPress={loadGoogleStatus}
                accessibilityRole="button"
                accessibilityLabel={t('googleAuth.retry')}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={19} color={DarkThemeColors.primary} />
                <Text style={styles.googleSecondaryButtonText}>{t('googleAuth.retry')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.divider} />
          </>
        )}

        {/* Налаштування додатку */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Налаштування додатку</Text>
          <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('AddSchedule')}>
            <FontAwesomeIcon icon={faClock} size={20} style={{ color: '#A0A6AD', marginRight: 10 }} />
            <Text style={styles.mainText}>Розклад</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('LanguageSelector')}>
            <FontAwesomeIcon icon={faGlobe} size={20} style={{ color: '#A0A6AD', marginRight: 10 }} />
            <Text style={styles.mainText}>Мова</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={Platform.OS === 'android' && !!verificationAction}
        transparent
        animationType="fade"
        onRequestClose={closeVerificationModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard} accessibilityViewIsModal>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('googleAuth.verificationTitle')}</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeVerificationModal}
                disabled={verificationBusy}
                accessibilityRole="button"
                accessibilityLabel={t('googleAuth.cancel')}
                accessibilityState={{ disabled: verificationBusy }}
              >
                <Ionicons name="close" size={24} color={DarkThemeColors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              {t(
                verificationAction === 'unlink'
                  ? 'googleAuth.verificationDescriptionUnlink'
                  : 'googleAuth.verificationDescriptionLink'
              )}
            </Text>
            <TextInput
              style={styles.accessCodeInput}
              value={accessCode}
              onChangeText={setAccessCode}
              placeholder={t('googleAuth.accessCodePlaceholder')}
              placeholderTextColor={DarkThemeColors.textSecondary}
              selectionColor={DarkThemeColors.primary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!verificationBusy}
              returnKeyType="done"
              onSubmitEditing={handleVerificationSubmit}
              accessibilityLabel={t('googleAuth.accessCodePlaceholder')}
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[
                  styles.modalSecondaryButton,
                  verificationBusy && styles.disabledButton,
                ]}
                onPress={closeVerificationModal}
                disabled={verificationBusy}
                accessibilityRole="button"
                accessibilityState={{ disabled: verificationBusy }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSecondaryButtonText}>{t('googleAuth.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalPrimaryButton,
                  verificationAction === 'unlink' && styles.modalDangerButton,
                  verificationBusy && styles.disabledButton,
                ]}
                onPress={handleVerificationSubmit}
                disabled={verificationBusy}
                accessibilityRole="button"
                accessibilityState={{ disabled: verificationBusy }}
                activeOpacity={0.8}
              >
                {verificationBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>
                    {t(
                      verificationAction === 'unlink'
                        ? 'googleAuth.verifyAndUnlink'
                        : 'googleAuth.verifyAndLink'
                    )}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

export default ProfileMain;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },
  content: { paddingBottom: 24 },
  header: {
    padding: 20,
    backgroundColor: '#152330',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userName: { fontSize: 24, color: '#f4f7fb', fontWeight: '700' },
  divider: {
    height: 1,
    backgroundColor: '#152330',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 1,
  },
  section: {
    backgroundColor: '#152330',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#82c6ff',
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemRowNoBorder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  mainText: { fontSize: 14, marginLeft: 8, color: '#f4f7fb' },
  iconSpacing: { marginRight: 10 },
  googleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  googleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: DarkThemeColors.surfaceElevated,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleSectionTitle: {
    flex: 1,
    marginBottom: 0,
  },
  googleDescription: {
    color: DarkThemeColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  googleLoadingRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLoadingText: {
    color: DarkThemeColors.textSecondary,
    fontSize: 14,
    marginLeft: 10,
  },
  googleStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  googleStatusText: {
    flex: 1,
    color: DarkThemeColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 8,
  },
  googleWarningText: {
    color: DarkThemeColors.warning,
  },
  googleLinkedText: {
    color: DarkThemeColors.success,
    fontWeight: '700',
  },
  googleErrorText: {
    color: DarkThemeColors.danger,
  },
  googleAccountName: {
    color: DarkThemeColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  googleAccountEmail: {
    color: DarkThemeColors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  googlePrimaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DarkThemeColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  googleDangerButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,91,91,0.12)',
    borderWidth: 1,
    borderColor: DarkThemeColors.danger,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  googleDangerButtonText: {
    color: DarkThemeColors.danger,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  googleSecondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,161,255,0.1)',
    borderWidth: 1,
    borderColor: DarkThemeColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  googleSecondaryButtonText: {
    color: DarkThemeColors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DarkThemeColors.overlay,
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: DarkThemeColors.surface,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 18,
    padding: 18,
  },
  modalHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    flex: 1,
    color: DarkThemeColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
    marginTop: -8,
  },
  modalDescription: {
    color: DarkThemeColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  accessCodeInput: {
    minHeight: 50,
    color: DarkThemeColors.text,
    backgroundColor: DarkThemeColors.background,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 11,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  modalButtonRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 10,
    marginRight: 10,
    paddingHorizontal: 10,
  },
  modalSecondaryButtonText: {
    color: DarkThemeColors.primarySoft,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DarkThemeColors.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  modalDangerButton: {
    backgroundColor: DarkThemeColors.danger,
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
