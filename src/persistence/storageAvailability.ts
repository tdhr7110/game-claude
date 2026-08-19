// ============================================================
// localStorage が使用できない環境(プライベートブラウジング・容量超過・
// SSR等)でもゲーム進行自体は継続できるようにするための可用性チェック。
// 一度判定した結果はモジュール内でキャッシュし、無駄な書き込み試行を避ける。
// ============================================================

let cachedAvailable: boolean | null = null;

export function isStorageAvailable(): boolean {
  if (cachedAvailable !== null) return cachedAvailable;
  try {
    const testKey = '__chimera_battle_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    cachedAvailable = true;
  } catch {
    cachedAvailable = false;
  }
  return cachedAvailable;
}

export function safeGetItem(key: string): string | null {
  if (!isStorageAvailable()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 容量超過などは無視する(保存は補助機能であり、ゲーム進行自体には影響させない)
  }
}

export function safeRemoveItem(key: string): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 無視する
  }
}
