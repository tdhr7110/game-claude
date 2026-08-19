// テスト環境(vitestのnode環境)にはlocalStorageが無い場合があるため、
// 最小限のインメモリ実装で補う。collectionStore.tsなどブラウザのlocalStorageに
// 依存するモジュールをテストするための共通ヘルパー。
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

export function installLocalStorageStub(): Storage {
  const stub = new MemoryStorage() as unknown as Storage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = stub;
  return stub;
}
