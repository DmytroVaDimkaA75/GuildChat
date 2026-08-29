import database from '@react-native-firebase/database';

const INVALID_FIREBASE_KEY = /[.#$\[\]\/]/;

const createGuildLookupError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export const loadGuildsForUser = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || INVALID_FIREBASE_KEY.test(normalizedUserId)) {
    throw createGuildLookupError(
      'app/session-invalid',
      'The application user identity is invalid.'
    );
  }

  const membershipsSnapshot = await database()
    .ref(`users/${normalizedUserId}/userGuilds`)
    .once('value');
  const memberships = membershipsSnapshot.exists()
    ? membershipsSnapshot.val()
    : {};

  if (!memberships || typeof memberships !== 'object') return [];

  const guilds = await Promise.all(
    Object.entries(memberships).map(async ([guildId, membership]) => {
      const normalizedGuildId = String(guildId || '').trim();
      if (
        !normalizedGuildId ||
        INVALID_FIREBASE_KEY.test(normalizedGuildId)
      ) {
        return null;
      }

      const guildRef = database().ref(`guilds/${normalizedGuildId}`);
      const [guildNameSnapshot, worldNameSnapshot, memberSnapshot] =
        await Promise.all([
          guildRef.child('guildName').once('value'),
          guildRef.child('worldName').once('value'),
          guildRef.child(`guildUsers/${normalizedUserId}`).once('value'),
        ]);

      if (!memberSnapshot.exists()) return null;

      const membershipData =
        membership && typeof membership === 'object' ? membership : {};
      const memberData = memberSnapshot.val() || {};

      return {
        guildId: normalizedGuildId,
        guildName: String(
          guildNameSnapshot.val() ||
          worldNameSnapshot.val() ||
          normalizedGuildId
        ),
        imageUrl: String(
          membershipData.imageUrl || memberData.imageUrl || ''
        ),
      };
    })
  );

  return guilds.filter(Boolean);
};
