import auth from '@react-native-firebase/auth';
import {
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

const FUNCTIONS_REGION = 'europe-west1';
const GOOGLE_PROVIDER_ID = 'google.com';
const GOOGLE_WEB_CLIENT_ID = String(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
).trim();

let googleSignInConfigured = false;

const createGoogleAuthError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const functionsInstance = getFunctions(undefined, FUNCTIONS_REGION);

const getCallable = (name) =>
  httpsCallable(functionsInstance, name);

const configureGoogleSignIn = () => {
  if (googleSignInConfigured) return;
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw createGoogleAuthError(
      'google/configuration-missing',
      'Google Sign-In web client ID is not configured.'
    );
  }

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  googleSignInConfigured = true;
};

const getGoogleIdToken = async () => {
  configureGoogleSignIn();

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });
  }

  const result = await GoogleSignin.signIn();
  if (result?.type === 'cancelled') {
    throw createGoogleAuthError(
      'google/cancelled',
      'Google Sign-In was cancelled.'
    );
  }

  const idToken = String(
    result?.data?.idToken || result?.idToken || ''
  ).trim();
  if (!idToken) {
    throw createGoogleAuthError(
      'google/token-missing',
      'Google did not return an ID token.'
    );
  }

  return idToken;
};

const signInWithReturnedCustomToken = async (payload) => {
  const userId = String(payload?.userId || '').trim();
  const customToken = String(payload?.customToken || '').trim();
  if (!userId || !customToken) {
    throw createGoogleAuthError(
      'google/invalid-server-response',
      'Authentication response is incomplete.'
    );
  }

  const credential = await auth().signInWithCustomToken(customToken);
  if (String(credential?.user?.uid || '') !== userId) {
    await auth().signOut();
    throw createGoogleAuthError(
      'google/account-mismatch',
      'Firebase identity does not match the GuildChat account.'
    );
  }

  return { userId };
};

const clearNativeGoogleSession = async () => {
  try {
    configureGoogleSignIn();
    await GoogleSignin.signOut();
  } catch (error) {
    console.warn(
      'Local Google session cleanup failed:',
      error?.code || 'unknown'
    );
  }
};

export const discardAuthenticatedSession = async ({
  clearGoogleSession = false,
} = {}) => {
  let firebaseSessionCleared = true;
  try {
    if (auth().currentUser) {
      await auth().signOut();
    }
  } catch (error) {
    firebaseSessionCleared = false;
    console.warn(
      'Unfinished Firebase session cleanup failed:',
      error?.code || 'unknown'
    );
  } finally {
    if (clearGoogleSession) {
      await clearNativeGoogleSession();
    }
  }
  return firebaseSessionCleared;
};

export const authenticateLegacyAccount = async ({
  accessCode,
  expectedUserId = '',
}) => {
  const normalizedAccessCode = String(accessCode || '').trim();
  const normalizedExpectedUserId = String(expectedUserId || '').trim();
  if (!normalizedAccessCode) {
    throw createGoogleAuthError(
      'google/access-code-required',
      'An access code is required.'
    );
  }

  const callable = getCallable('authenticateLegacyAccount');
  const response = await callable({
    accessCode: normalizedAccessCode,
    ...(normalizedExpectedUserId
      ? { expectedUserId: normalizedExpectedUserId }
      : {}),
  });

  return signInWithReturnedCustomToken(response?.data);
};

export const signInWithGoogleAccount = async () => {
  const idToken = await getGoogleIdToken();
  const callable = getCallable('loginWithGoogle');
  try {
    const response = await callable({ idToken });
    return signInWithReturnedCustomToken(response?.data);
  } catch (error) {
    const code = String(error?.code || '');
    if (
      code === 'failed-precondition' ||
      code === 'functions/failed-precondition'
    ) {
      await clearNativeGoogleSession();
      throw createGoogleAuthError(
        'google/not-linked',
        'Google account is not linked to GuildChat.'
      );
    }
    throw error;
  }
};

export const getGoogleLinkStatus = async () => {
  if (!auth().currentUser) {
    throw createGoogleAuthError(
      'google/session-required',
      'The GuildChat account must be verified first.'
    );
  }

  const callable = getCallable('getGoogleLinkStatus');
  const response = await callable({});
  const data = response?.data || {};

  return {
    userId: String(data.userId || '').trim(),
    linked: data.linked === true,
    email: String(data.email || '').trim(),
    displayName: String(data.displayName || '').trim(),
  };
};

export const linkGoogleAccount = async () => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw createGoogleAuthError(
      'google/session-required',
      'The GuildChat account must be verified first.'
    );
  }

  const expectedUid = currentUser.uid;
  const idToken = await getGoogleIdToken();
  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const result = await currentUser.linkWithCredential(googleCredential);

  if (String(result?.user?.uid || '') !== expectedUid) {
    throw createGoogleAuthError(
      'google/account-mismatch',
      'Linked identity does not match the GuildChat account.'
    );
  }

  const googleProvider = result?.user?.providerData?.find(
    (provider) => provider?.providerId === GOOGLE_PROVIDER_ID
  );
  return {
    userId: expectedUid,
    linked: true,
    email: String(googleProvider?.email || '').trim(),
    displayName: String(googleProvider?.displayName || '').trim(),
  };
};

export const unlinkGoogleAccount = async ({ accessCode }) => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw createGoogleAuthError(
      'google/session-required',
      'The GuildChat account must be verified first.'
    );
  }

  const normalizedAccessCode = String(accessCode || '').trim();
  if (!normalizedAccessCode) {
    throw createGoogleAuthError(
      'google/access-code-required',
      'An access code is required.'
    );
  }

  const callable = getCallable('unlinkGoogleAccount');
  const response = await callable({ accessCode: normalizedAccessCode });

  try {
    await auth().currentUser?.reload();
    await clearNativeGoogleSession();
  } catch (error) {
    console.warn(
      'Google provider was unlinked, but local Google session cleanup failed:',
      error?.code || 'unknown'
    );
  }

  return {
    userId: currentUser.uid,
    linked: response?.data?.linked === true,
    email: '',
    displayName: '',
  };
};

export const isGoogleAuthCancellation = (error) => {
  const code = String(error?.code || '');
  return (
    code === 'google/cancelled' ||
    code === statusCodes.SIGN_IN_CANCELLED
  );
};

export { GOOGLE_PROVIDER_ID };
