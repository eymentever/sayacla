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

const LIMIT_ID = 'verim-next-limit';
const WEEKLY_ID = 'verim-weekly-heating';
const FOLLOWUP_ID = 'verim-tier-followup';

/** Gelecek ayın 1'inde, ilin yeni kademe limitini haber verir (her açılışta yeniden planlanır). */
export async function scheduleNextLimitNotice(province: string, nextMonthLimit: number, prevLimit: number, monthName: string) {
  await Notifications.cancelScheduledNotificationAsync(LIMIT_ID).catch(() => {});
  if (!Number.isFinite(nextMonthLimit)) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + 1, 1, 10, 0, 0);
  const up = nextMonthLimit > prevLimit;
  await Notifications.scheduleNotificationAsync({
    identifier: LIMIT_ID,
    content: {
      title: `${monthName} doğalgaz limitin: ${Math.round(nextMonthLimit)} m³`,
      body: `${province} için limit ${Math.round(prevLimit)} → ${Math.round(nextMonthLimit)} m³ ${up ? 'yükseldi' : 'düştü'}. Ayın ilk okumasını yap, takibe başla.`,
      data: { route: '/scan' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminders' } as any,
  });
}

/** Isıtma sezonunda (Ekim–Nisan) her pazar 11:00 okuma hatırlatıcısı; sezon dışında iptal. */
export async function syncWeeklyHeatingReminder(enabled: boolean) {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
  const m = new Date().getMonth();
  if (!enabled || !(m >= 9 || m <= 3)) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_ID,
    content: { title: 'Haftalık kademe kontrolü', body: 'Doğalgaz sayacını okut: limitine ne kadar kaldığını ve ay sonu faturanı gör.', data: { route: '/scan' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 11, minute: 0, channelId: 'reminders' } as any,
  });
}

/** Kademe riski varsa 3 gün sonra tekrar okumayı hatırlatır. */
export async function scheduleTierFollowUp() {
  await Notifications.cancelScheduledNotificationAsync(FOLLOWUP_ID).catch(() => {});
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: FOLLOWUP_ID,
    content: { title: 'Limitine yakınsın — tekrar oku', body: 'Son 3 günün tüketimine bakalım; 1. kademede kalıp kalmadığını hemen gör.', data: { route: '/scan' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 * 86400, channelId: 'alerts' } as any,
  });
}
