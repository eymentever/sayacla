// "Sayacım nerede, neyi okuyacağım?" rehberi — ilk okumada otomatik açılır, sonra "Sayacım nerede?" ile.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText, Circle, Path } from 'react-native-svg';
import { C, FONT, RADIUS, SPACE } from '../theme';
import { Sheet, T, Button } from './index';

type Kind = 'water' | 'gas';

const WHERE: Record<Kind, string[]> = {
  gas: [
    'Mutfakta kombinin ya da ocağın yakınında, sarı doğalgaz borusunun üzerinde',
    'Apartman girişinde veya merdiven boşluğunda, daire numaralı sayaç dolabında',
    'Müstakil evde dış duvardaki gri/beyaz kutunun içinde',
  ],
  water: [
    'Banyoda veya mutfakta lavabo altında, ana su vanasının yanında',
    'Apartman bodrumunda ya da girişte, daire numaralı su sayaçları panosunda',
    'Bahçede yerdeki küçük metal kapağın (rögar) altında',
  ],
};

const WHAT: Record<Kind, string> = {
  gas: 'Siyah zemindeki beyaz rakamları soldan sağa oku. Virgülden sonrası (genelde kırmızı) gerekmez. Kartlı sayaçta ekrandaki "Toplam tüketim (m³)" değerini kullan — kalan kredi değil.',
  water: 'Siyah tekerleklerdeki rakamları oku; bunlar m³’tür. Kırmızı tekerlekler litredir, istersen virgülden sonra yazabilirsin. Dijital/kartlı sayaçta "Toplam m³" yazan değeri kullan.',
};

function MeterSample({ kind }: { kind: Kind }) {
  const color = kind === 'water' ? C.water : C.gas;
  const black = kind === 'water' ? ['0', '1', '2', '2', '4'] : ['0', '4', '3', '0', '3'];
  const red = kind === 'water' ? ['3', '8', '2'] : ['5', '1', '7'];
  const w = 300, cw = 30;
  return (
    <Svg width={w} height={110} accessibilityLabel="Örnek sayaç göstergesi">
      <Rect x={0} y={0} width={w} height={110} rx={14} fill={C.bgRaised} stroke={C.border} />
      {black.map((d, i) => (
        <React.Fragment key={'b' + i}>
          <Rect x={20 + i * (cw + 4)} y={28} width={cw} height={44} rx={4} fill="#111" />
          <SvgText x={20 + i * (cw + 4) + cw / 2} y={60} fontSize={24} fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="System">{d}</SvgText>
        </React.Fragment>
      ))}
      <Circle cx={20 + 5 * (cw + 4) + 2} cy={66} r={2.5} fill={C.textDim} />
      {red.map((d, i) => (
        <React.Fragment key={'r' + i}>
          <Rect x={20 + 5 * (cw + 4) + 10 + i * (cw + 4)} y={28} width={cw} height={44} rx={4} fill="#7A1020" />
          <SvgText x={20 + 5 * (cw + 4) + 10 + i * (cw + 4) + cw / 2} y={60} fontSize={24} fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="System">{d}</SvgText>
        </React.Fragment>
      ))}
      <Path d={`M 16 80 H ${20 + 5 * (cw + 4) - 4}`} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <SvgText x={20 + 2.5 * (cw + 4)} y={98} fontSize={12} fontWeight="700" fill={color} textAnchor="middle" fontFamily="System">Bunu yaz: {Number(black.join(''))}</SvgText>
      <SvgText x={20 + 5 * (cw + 4) + 10 + 1.5 * (cw + 4)} y={98} fontSize={11} fill={C.textDim} textAnchor="middle" fontFamily="System">{kind === 'water' ? 'litre (isteğe bağlı)' : 'gerekmez'}</SvgText>
      <SvgText x={w - 14} y={20} fontSize={11} fill={C.textDim} textAnchor="end" fontFamily="System">m³</SvgText>
    </Svg>
  );
}

export function MeterGuide({ kind, visible, onClose }: { kind: Kind; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={kind === 'gas' ? 'Doğalgaz sayacını bul ve oku' : 'Su sayacını bul ve oku'}>
      <T.Label>1 · Nerede?</T.Label>
      {WHERE[kind].map(w => (
        <View key={w} style={s.li}><Text style={s.dot}>•</Text><T.Body style={{ flex: 1 }}>{w}</T.Body></View>
      ))}

      <T.Label style={{ marginTop: SPACE.lg }}>2 · Neyi okuyacağım?</T.Label>
      <View style={{ alignItems: 'center', marginVertical: SPACE.md }}><MeterSample kind={kind} /></View>
      <T.Body dim>{WHAT[kind]}</T.Body>

      <T.Label style={{ marginTop: SPACE.lg }}>3 · Neden iki kez?</T.Label>
      <T.Body dim>Sayaç, evin kurulduğundan beri toplam tüketimi gösterir. İlk okuma başlangıç noktasıdır. 3–7 gün sonra tekrar okuduğunda aradaki farktan günlük tüketimini, ay sonu faturanı ve {kind === 'gas' ? 'ucuz fiyat limitine ne kadar kaldığını' : 'tasarruf fırsatlarını'} hesaplarız.</T.Body>

      <View style={s.tip}>
        <T.Small color={C.text}>İpucu: Kamerayı rakamlara yaklaştır, karanlıksa flaşı aç. Okunan değeri her zaman kaydetmeden önce kontrol edebilirsin.</T.Small>
      </View>
      <Button title="Anladım" onPress={onClose} style={{ marginTop: SPACE.lg }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  li: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dot: { color: C.brand, fontSize: FONT.md, lineHeight: 21 },
  tip: { marginTop: SPACE.lg, padding: SPACE.md, borderRadius: RADIUS.md, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand + '33' },
});
