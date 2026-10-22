// Verim UI kiti — tüm ekranlar bu bileşenlerle kurulur; tutarlı boşluk, tipografi, dokunma alanı (≥44pt).

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, FlatList,
  KeyboardAvoidingView, Platform, ViewStyle, TextStyle, ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, Search, Check, ChevronRight } from 'lucide-react-native';
import { C, FONT, RADIUS, SPACE, TAB_CLEARANCE } from '../theme';

export const tap = () => Haptics.selectionAsync().catch(() => {});

// ── Ekran ───────────────────────────────────────────────────────────────────

export function Screen({ children, scroll = true, tabs = true, style }: {
  children: React.ReactNode; scroll?: boolean; tabs?: boolean; style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + SPACE.md, paddingBottom: (tabs ? TAB_CLEARANCE : insets.bottom + SPACE.xl) };
  if (!scroll) return <View style={[s.screen, pad, style]}>{children}</View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, pad, style]} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.h1} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ── Tipografi ───────────────────────────────────────────────────────────────

export const T = {
  Label: ({ children, color, style }: { children: React.ReactNode; color?: string; style?: TextStyle }) =>
    <Text style={[s.label, color ? { color } : null, style]}>{children}</Text>,
  Body: ({ children, dim, style, lines }: { children: React.ReactNode; dim?: boolean; style?: TextStyle; lines?: number }) =>
    <Text numberOfLines={lines} style={[s.body, dim && { color: C.textDim }, style]}>{children}</Text>,
  Title: ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.title, style]}>{children}</Text>,
  Big: ({ children, color, style }: { children: React.ReactNode; color?: string; style?: TextStyle }) =>
    <Text style={[s.big, color ? { color } : null, style]} adjustsFontSizeToFit numberOfLines={1}>{children}</Text>,
  Small: ({ children, color, style }: { children: React.ReactNode; color?: string; style?: TextStyle }) =>
    <Text style={[s.small, color ? { color } : null, style]}>{children}</Text>,
};

// ── Kart / satır ────────────────────────────────────────────────────────────

export function Card({ children, style, accent, onPress }: { children: React.ReactNode; style?: ViewStyle; accent?: string; onPress?: () => void }) {
  const body = <View style={[s.card, accent ? { borderColor: accent + '55' } : null, style]}>{children}</View>;
  return onPress ? <TouchableOpacity activeOpacity={0.8} onPress={() => { tap(); onPress(); }}>{body}</TouchableOpacity> : body;
}

export function Row({ label, value, valueColor, bold, onPress, icon }: {
  label: string; value?: string; valueColor?: string; bold?: boolean; onPress?: () => void; icon?: React.ReactNode;
}) {
  const inner = (
    <View style={s.row}>
      {icon ? <View style={{ marginRight: SPACE.md }}>{icon}</View> : null}
      <Text style={[s.rowLabel, bold && { color: C.text, fontWeight: '700' }]} numberOfLines={2}>{label}</Text>
      {value != null ? <Text style={[s.rowValue, valueColor ? { color: valueColor } : null, bold && { fontWeight: '800' }]}>{value}</Text> : null}
      {onPress ? <ChevronRight size={18} color={C.textMuted} style={{ marginLeft: 4 }} /> : null}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={() => { tap(); onPress(); }} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

export const Divider = () => <View style={s.divider} />;

// ── Butonlar ────────────────────────────────────────────────────────────────

export function Button({ title, onPress, kind = 'primary', color, disabled, loading, icon, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  color?: string; disabled?: boolean; loading?: boolean; icon?: React.ReactNode; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? (color ?? C.brand) : kind === 'danger' ? C.dangerDim : kind === 'secondary' ? C.cardHi : 'transparent';
  const fg = kind === 'primary' ? '#04140D' : kind === 'danger' ? C.danger : kind === 'ghost' ? (color ?? C.brand) : C.text;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => { tap(); onPress(); }}
      activeOpacity={0.85}
      style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, kind === 'secondary' && { borderWidth: 1, borderColor: C.border }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={[s.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; color?: string }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={s.seg}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[s.segItem, on && { backgroundColor: (o.color ?? C.brand) + '22', borderColor: (o.color ?? C.brand) + '66' }]}
            onPress={() => { tap(); onChange(o.value); }} accessibilityState={{ selected: on }}>
            <Text style={[s.segText, on && { color: o.color ?? C.brand }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Badge({ text, color = C.textDim }: { text: string; color?: string }) {
  return <View style={[s.badge, { backgroundColor: color + '1F', borderColor: color + '44' }]}><Text style={[s.badgeText, { color }]}>{text}</Text></View>;
}

export function Progress({ ratio, color, marker }: { ratio: number; color: string; marker?: number }) {
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${Math.max(2, Math.min(100, ratio * 100))}%`, backgroundColor: color }]} />
      {marker != null ? <View style={[s.marker, { left: `${Math.min(100, marker * 100)}%` }]} /> : null}
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: SPACE['2xl'] }}>
      {icon}
      <Text style={[s.title, { marginTop: SPACE.md, textAlign: 'center' }]}>{title}</Text>
      <Text style={[s.body, { color: C.textDim, textAlign: 'center', marginTop: 6 }]}>{body}</Text>
      {action ? <View style={{ marginTop: SPACE.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </Card>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

export function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', suffix, autoFocus, hint, error }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad'; suffix?: string; autoFocus?: boolean; hint?: string; error?: string;
}) {
  return (
    <View style={{ marginBottom: SPACE.lg }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.input, error ? { borderColor: C.danger } : null]}>
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.textMuted}
          keyboardType={keyboardType} autoFocus={autoFocus} style={s.inputText} selectionColor={C.brand}
          accessibilityLabel={label}
        />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={[s.small, { color: C.danger, marginTop: 6 }]}>{error}</Text>
        : hint ? <Text style={[s.small, { marginTop: 6 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Stepper({ value, onChange, min = 1, max = 12, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <View style={{ marginBottom: SPACE.lg }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.input, { justifyContent: 'space-between' }]}>
        <TouchableOpacity onPress={() => { tap(); onChange(Math.max(min, value - 1)); }} style={s.stepBtn} accessibilityLabel="Azalt"><Text style={s.stepTxt}>−</Text></TouchableOpacity>
        <Text style={[s.inputText, { textAlign: 'center' }]}>{value}</Text>
        <TouchableOpacity onPress={() => { tap(); onChange(Math.min(max, value + 1)); }} style={s.stepBtn} accessibilityLabel="Artır"><Text style={s.stepTxt}>+</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ── Alt sayfa (modal) ───────────────────────────────────────────────────────

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + SPACE.lg }]}>
          <View style={s.sheetHead}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Kapat"><X size={22} color={C.textDim} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Aranabilir liste seçici (il / ilçe) */
export function Picker({ label, value, options, onChange, placeholder = 'Seç' }: {
  label: string; value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr');
    return n ? options.filter(o => o.toLocaleLowerCase('tr').includes(n)) : options;
  }, [q, options]);
  return (
    <View style={{ marginBottom: SPACE.lg }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={s.input} onPress={() => { tap(); setOpen(true); }} accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`}>
        <Text style={[s.inputText, !value && { color: C.textMuted }]}>{value || placeholder}</Text>
        <ChevronRight size={18} color={C.textMuted} />
      </TouchableOpacity>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={[s.input, { marginBottom: SPACE.md }]}>
          <Search size={18} color={C.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Ara" placeholderTextColor={C.textMuted} style={[s.inputText, { marginLeft: 8 }]} autoFocus />
        </View>
        <FlatList
          data={list as string[]}
          keyExtractor={i => i}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.option} onPress={() => { tap(); onChange(item); setOpen(false); setQ(''); }}>
              <Text style={[s.body, item === value && { color: C.brand, fontWeight: '700' }]}>{item}</Text>
              {item === value ? <Check size={18} color={C.brand} /> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[s.body, { color: C.textDim, padding: SPACE.lg }]}>Sonuç yok</Text>}
        />
      </Sheet>
    </View>
  );
}

export const st = StyleSheet.create({
  gap: { height: SPACE.lg },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.lg, gap: SPACE.md },
  h1: { color: C.text, fontSize: FONT['2xl'], fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: C.textDim, fontSize: FONT.sm, marginTop: 2 },
  label: { color: C.textDim, fontSize: FONT.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  body: { color: C.text, fontSize: FONT.md, lineHeight: 21 },
  title: { color: C.text, fontSize: FONT.lg, fontWeight: '700' },
  big: { color: C.text, fontSize: FONT['4xl'], fontWeight: '800', letterSpacing: -1.5 },
  small: { color: C.textDim, fontSize: FONT.xs + 1, lineHeight: 17 },
  card: { backgroundColor: C.card, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, padding: SPACE.lg, marginBottom: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 44 },
  rowLabel: { flex: 1, color: C.textDim, fontSize: FONT.md },
  rowValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', marginLeft: SPACE.md },
  divider: { height: 1, backgroundColor: C.divider },
  btn: { minHeight: 52, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.lg },
  btnText: { fontSize: FONT.md, fontWeight: '800' },
  seg: { flexDirection: 'row', backgroundColor: C.bgRaised, borderRadius: RADIUS.lg, padding: 4, gap: 4, borderWidth: 1, borderColor: C.border },
  segItem: { flex: 1, minHeight: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  segText: { color: C.textDim, fontWeight: '700', fontSize: FONT.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1, alignSelf: 'flex-start' },
  badgeText: { fontSize: FONT.xs, fontWeight: '800' },
  track: { height: 10, backgroundColor: C.bgRaised, borderRadius: 5, overflow: 'visible', borderWidth: 1, borderColor: C.border },
  fill: { height: '100%', borderRadius: 5 },
  marker: { position: 'absolute', top: -4, width: 2, height: 16, backgroundColor: C.text, marginLeft: -1 },
  fieldLabel: { color: C.textDim, fontSize: FONT.sm, fontWeight: '600', marginBottom: 8 },
  input: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgRaised, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: SPACE.md, minHeight: 52 },
  inputText: { flex: 1, color: C.text, fontSize: FONT.base, paddingVertical: 12 },
  suffix: { color: C.textDim, fontSize: FONT.md, marginLeft: 8 },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: C.brand, fontSize: 24, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: C.bgRaised, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.lg, maxHeight: '88%', borderWidth: 1, borderColor: C.border },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: C.divider },
});
