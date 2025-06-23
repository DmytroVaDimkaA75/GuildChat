console.log('🌱 registerToken MODULE LOADED');
export async function registerFcmToken(uid) {
  console.log('🟡 registerFcmToken CALLED, uid =', uid);
  console.log('🟡 Device.isDevice =', Device.isDevice);
  console.log('Device.isDevice =', Device.isDevice);
  console.log('>>> registerFcmToken CALLED, uid =', uid);

  if (!Device.isDevice) {
    console.log('⛔ Device.isDevice = false → ви в емуляторі, токена не буде');
    return;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  console.log('>>> notification permission status =', status);
  if (status !== 'granted') {
    console.log('⛔ permission not granted → токен не отримаємо');
    return;
  }

  const { data: expoToken } = await Notifications.getExpoPushTokenAsync({
    projectId: 'guildchat-5d8c1',
  });
  console.log('>>> Expo token =', expoToken);

  await set(ref(database, `users/${uid}/fcmToken`), expoToken);
  console.log('✅ push-token saved to RTDB');
}
