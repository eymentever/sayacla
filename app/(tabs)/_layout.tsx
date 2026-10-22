import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Home, ScanLine, BarChart3, Settings } from 'lucide-react-native';
import { C } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarItemStyle: { height: 52 },
        tabBarStyle: {
          position: 'absolute', left: 16, right: 16, bottom: Platform.OS === 'ios' ? 24 : 14,
          height: 70, paddingBottom: 10, paddingTop: 8, borderRadius: 22,
          backgroundColor: 'rgba(15,22,38,0.97)', borderTopWidth: 0, borderWidth: 1, borderColor: C.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Özet', tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: 'Oku', tabBarIcon: ({ color }) => <ScanLine size={22} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: 'Geçmiş', tabBarIcon: ({ color }) => <BarChart3 size={22} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Ayarlar', tabBarIcon: ({ color }) => <Settings size={22} color={color} /> }} />
    </Tabs>
  );
}
