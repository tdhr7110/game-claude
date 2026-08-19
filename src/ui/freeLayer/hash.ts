// 自由合体レイヤー表示: 部位インスタンスごとの見た目バリエーション(角度・縮尺・明度)を
// 「装着順」ではなく「安定した文字列(instanceId等)」から決定論的に導出するためのハッシュ関数。
// 同じ入力なら常に同じ出力になるため、装着順が変わっても各個体の見た目は変化しない。

// FNV-1a (32bit)。暗号用途ではなく、見た目のばらつきを再現性ある形で作るためだけに使う。
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// saltを変えることで同じseedから複数の独立した乱数系列(角度用・縮尺用・明度用...)を作れる。
export function seededUnit(seed: string, salt: string): number {
  const h = hashString(`${seed}::${salt}`);
  return (h % 100000) / 100000;
}

// [min, max) の範囲に写像したseeded random。
export function seededRange(seed: string, salt: string, min: number, max: number): number {
  return min + seededUnit(seed, salt) * (max - min);
}
