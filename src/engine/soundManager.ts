// ============================================================
// TEST8: 戦闘演出・SE統合用の簡易SEマネージャ。
// TEST4(test4/chimera-butcher-phase4)のsoundManager.tsを土台に、
// 現行コマンドシステムのBattleEvent構成へ合わせて再実装したもの。
// Web Audio APIで生成した短いトーンのみを使用し、外部音源ファイルは一切使わない。
// 音量設定のみlocalStorageへ永続化する(ミュート状態は永続化しない)。
// ============================================================

const STORAGE_KEY = 'chimera-battle:test8:se-volume:v1';

export type SEKind =
  | 'hit'
  | 'crit'
  | 'poison'
  | 'burn'
  | 'heal'
  | 'guard'
  | 'reflect'
  | 'command'
  | 'victory'
  | 'defeat'
  | 'telegraph'
  // TEST18: 部位獲得・コマンド獲得の報酬演出用。素材が用意でき次第、TONE_TABLEの該当エントリを
  // 差し替えるだけで済むよう、呼び出し側(RewardOverlay)は種別名だけで発火する。
  | 'part_acquired'
  | 'command_acquired';

interface SESettings {
  muted: boolean;
  volume: number; // 0..1
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0.5;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.5;
  } catch {
    return 0.5;
  }
}

let settings: SESettings = { muted: false, volume: loadVolume() };
let audioCtx: AudioContext | null = null;
let unlockAttached = false;
const listeners = new Set<() => void>();

function persistVolume() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.volume));
  } catch {
    // 保存できなくても致命的ではないため無視する(ゲーム進行には影響させない)
  }
}

function notify() {
  for (const l of listeners) l();
}

export function subscribeSESettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSESettings(): SESettings {
  return settings;
}

export function setSEMuted(muted: boolean) {
  settings = { ...settings, muted };
  notify();
}

export function setSEVolume(volume: number) {
  settings = { ...settings, volume: Math.min(1, Math.max(0, volume)) };
  persistVolume();
  notify();
}

function createCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

// ブラウザの自動再生制限対応: 最初のユーザー操作(ポインタ/キー/タッチ)で
// AudioContextを生成・resumeする。ゲーム画面のマウント時に一度だけ呼び出す想定。
export function initAudioUnlock() {
  if (unlockAttached || typeof window === 'undefined') return;
  unlockAttached = true;
  const unlock = () => {
    try {
      if (!audioCtx) audioCtx = createCtx();
      if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    } catch {
      // 音声が利用できない環境でもゲーム進行を止めない
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = createCtx();
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
}

// 各SE種別ごとの簡易トーン定義(複数トーンを連ねて質感を出す)
const TONE_TABLE: Record<SEKind, Tone[]> = {
  hit: [{ freq: 220, duration: 0.06, type: 'square', gain: 0.5 }],
  crit: [
    { freq: 660, duration: 0.05, type: 'square', gain: 0.6 },
    { freq: 990, duration: 0.08, type: 'square', gain: 0.6 },
  ],
  poison: [{ freq: 180, duration: 0.14, type: 'sawtooth', gain: 0.4, slideTo: 120 }],
  burn: [
    { freq: 300, duration: 0.05, type: 'sawtooth', gain: 0.45 },
    { freq: 450, duration: 0.1, type: 'sawtooth', gain: 0.4, slideTo: 200 },
  ],
  heal: [
    { freq: 523, duration: 0.08, type: 'sine', gain: 0.4 },
    { freq: 659, duration: 0.12, type: 'sine', gain: 0.4 },
  ],
  guard: [{ freq: 180, duration: 0.15, type: 'sine', gain: 0.5, slideTo: 220 }],
  reflect: [
    { freq: 900, duration: 0.04, type: 'triangle', gain: 0.5 },
    { freq: 500, duration: 0.08, type: 'triangle', gain: 0.4 },
  ],
  command: [{ freq: 300, duration: 0.06, type: 'square', gain: 0.4, slideTo: 500 }],
  victory: [
    { freq: 523, duration: 0.1, type: 'sine', gain: 0.5 },
    { freq: 659, duration: 0.1, type: 'sine', gain: 0.5 },
    { freq: 784, duration: 0.1, type: 'sine', gain: 0.5 },
    { freq: 1047, duration: 0.3, type: 'sine', gain: 0.5 },
  ],
  defeat: [{ freq: 300, duration: 0.2, type: 'sawtooth', gain: 0.5, slideTo: 100 }],
  // TEST7×TEST8統合: 大技の予兆(テレグラフ)専用。他のSEと聞き分けやすい上昇する警告音。
  telegraph: [
    { freq: 440, duration: 0.09, type: 'triangle', gain: 0.45, slideTo: 700 },
    { freq: 440, duration: 0.09, type: 'triangle', gain: 0.45, slideTo: 700 },
  ],
  // TEST18: 部位獲得・コマンド獲得の報酬演出用の簡易トーン(本番音源が用意でき次第差し替え予定)。
  part_acquired: [
    { freq: 523, duration: 0.07, type: 'sine', gain: 0.45 },
    { freq: 784, duration: 0.14, type: 'sine', gain: 0.45 },
  ],
  command_acquired: [
    { freq: 587, duration: 0.06, type: 'triangle', gain: 0.45 },
    { freq: 880, duration: 0.06, type: 'triangle', gain: 0.45 },
    { freq: 1175, duration: 0.16, type: 'triangle', gain: 0.45 },
  ],
};

let lastPlayedAt: Partial<Record<SEKind, number>> = {};
// 同種SEの過剰な同時発音を防ぐ最小間隔(多腕一斉ヒット等での音割れ・処理負荷対策)
const MIN_INTERVAL_MS: Partial<Record<SEKind, number>> = { hit: 35, crit: 80, poison: 200, burn: 200, telegraph: 400 };

// 音声が利用できない・エラーが起きた場合でもゲーム進行を止めないよう、
// 内部の処理は必ずtry/catchで囲む。
export function playSE(kind: SEKind) {
  try {
    if (settings.muted || settings.volume <= 0) return;
    const now = performance.now();
    const minInterval = MIN_INTERVAL_MS[kind];
    if (minInterval && lastPlayedAt[kind] !== undefined && now - lastPlayedAt[kind]! < minInterval) return;
    lastPlayedAt[kind] = now;

    const ctx = getCtx();
    if (!ctx || ctx.state !== 'running') return;
    const tones = TONE_TABLE[kind];
    let t = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, t);
      if (tone.slideTo) osc.frequency.linearRampToValueAtTime(tone.slideTo, t + tone.duration);
      const peakGain = tone.gain * settings.volume;
      gainNode.gain.setValueAtTime(0.0001, t);
      gainNode.gain.linearRampToValueAtTime(peakGain, t + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t + tone.duration);
      osc.connect(gainNode).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + tone.duration + 0.02);
      t += tone.duration * 0.85;
    }
  } catch {
    // SE再生に失敗してもゲーム進行には一切影響させない
  }
}
