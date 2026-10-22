// Yerel bildirimler: aylık okuma hatırlatıcısı + gaz kademe uyarısı. Sunucu yok, veri cihazda kalır.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return r.granted;
}

export async function setupChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('alerts', { name: 'Kademe ve kaçak uyarıları', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('reminders', { name: 'Okuma hatırlatıcısı', importance: Notifications.AndroidImportance.DEFAULT });
}

const REMINDER_ID = 'verim-monthly-reading';

/** Her ayın `day`. günü 10:00'da hatırlatır. day=0 → iptal. */
export async function scheduleMonthlyReminder(day: number) {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  if (!day) return;
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: 'Sayaç okuma zamanı', body: 'Su ve doğalgaz sayacını okut; bu ayın faturasını ve kademe durumunu gör.', data: { route: '/scan' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: Math.min(28, Math.max(1, day)), hour: 10, minute: 0, channelId: 'reminders' } as any,
  });
}

/** Anlık uyarı (ör. kademe riski). Aynı anahtar ile ayda bir kez gönderilir — çağıran taraf kontrol eder. */
export async function notifyNow(title: string, body: string, route = '/') {
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data: { route } }, trigger: null });
}

export function onNotificationTap(cb: (route: string) => void) {
  return Notifications.addNotificationResponseReceivedListener(r => {
    const route = (r.notification.request.content.data as any)?.route;
    if (typeof route === 'string') cb(route);
  });
}
