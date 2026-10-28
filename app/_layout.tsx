import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { C } from '../src/theme';
import { useSayacla } from '../src/store/useSayacla';
import { syncTariffs } from '../src/services/tariffSync';
import { setupChannels, onNotificationTap, scheduleMonthlyReminder } from '../src/services/notify';
import { trackDailyOpen, track, flush } from '../src/services/analytics';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const hydrated = useSayacla(s => s.hydrated);
  const onboarded = useSayacla(s => s.profile.onboarded);
  const reminderDay = useSayacla(s => s.settings.reminderDay);
  const router = useRouter();

  useEffect(() => {
    setupChannels().catch(() => {});
    const sub = onNotificationTap(route => { track('notif_open', { route }); router.push(route as any); });
    const app = AppState.addEventListener('change', s => {
      if (s === 'active' && useSayacla.getState().hydrated) trackDailyOpen().catch(() => {});
      if (s === 'background') flush().catch(() => {});
    });
    return () => { sub.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    SplashScreen.hideAsync().catch(() => {});
    syncTariffs().catch(() => {});
    if (onboarded) scheduleMonthlyReminder(reminderDay).catch(() => {});
    if (onboarded) trackDailyOpen().catch(() => {});
  }, [hydrated, onboarded, reminderDay]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {/* Korumalı rotalar: kurulum bitmeden ana ekranlara, bittikten sonra kuruluma erişilemez */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="bill" options={{ presentation: 'modal' }} />
            <Stack.Screen name="leak-test" options={{ presentation: 'modal' }} />
            <Stack.Screen name="property" options={{ presentation: 'modal' }} />
            <Stack.Screen name="tariff" options={{ presentation: 'modal' }} />
            <Stack.Screen name="diagnose" options={{ presentation: 'modal' }} />
          </Stack.Protected>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
        </Stack>
        {!hydrated && (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }]}>
            <ActivityIndicator color={C.brand} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
