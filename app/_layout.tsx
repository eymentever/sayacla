import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { C } from '../src/theme';
import { useVerim } from '../src/store/useVerim';
import { syncTariffs } from '../src/services/tariffSync';
import { setupChannels, onNotificationTap, scheduleMonthlyReminder } from '../src/services/notify';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const hydrated = useVerim(s => s.hydrated);
  const onboarded = useVerim(s => s.profile.onboarded);
  const reminderDay = useVerim(s => s.settings.reminderDay);
  const router = useRouter();

  useEffect(() => {
    setupChannels().catch(() => {});
    const sub = onNotificationTap(route => router.push(route as any));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    SplashScreen.hideAsync().catch(() => {});
    syncTariffs().catch(() => {});
    if (onboarded) scheduleMonthlyReminder(reminderDay).catch(() => {});
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
