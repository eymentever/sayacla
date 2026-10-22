// Uzak tarife paketini GitHub'dan çeker (günde en fazla bir kez). Hata olursa gömülü paket kullanılır.

import { useVerim } from '../store/useVerim';

export const TARIFF_URL = 'https://raw.githubusercontent.com/eymentever/verim/main/tariffs/tariffs.json';
const DAY = 86_400_000;

export async function syncTariffs(force = false): Promise<'updated' | 'fresh' | 'failed'> {
  const { tariffsFetchedAt, setRemoteTariffs } = useVerim.getState();
  if (!force && tariffsFetchedAt && Date.now() - new Date(tariffsFetchedAt).getTime() < DAY) return 'fresh';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(TARIFF_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return 'failed';
    const json = await res.json();
    if (!json || typeof json !== 'object' || !json.gas || !json.water) return 'failed';
    setRemoteTariffs(json);
    return 'updated';
  } catch {
    return 'failed';
  }
}
