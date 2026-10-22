import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { C, FONT, SPACE } from '../src/theme';
import { Screen, T } from '../src/ui';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/data/privacy';

export default function Privacy() {
  const router = useRouter();
  return (
    <Screen tabs={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.lg }}>
        <T.Title style={{ fontSize: FONT.xl, flex: 1 }}>Gizlilik politikası</T.Title>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Kapat"><X size={24} color={C.textDim} /></TouchableOpacity>
      </View>
      <T.Small style={{ marginBottom: SPACE.lg }}>Son güncelleme: {PRIVACY_UPDATED}</T.Small>
      {PRIVACY_SECTIONS.map(s => (
        <View key={s.h} style={{ marginBottom: SPACE.lg }}>
          <T.Title style={{ fontSize: FONT.md, marginBottom: 4 }}>{s.h}</T.Title>
          <T.Body dim>{s.p}</T.Body>
        </View>
      ))}
    </Screen>
  );
}
