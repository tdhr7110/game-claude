// ============================================================
// TEST3フェーズ3: 簡易SEマネージャ。
// Web Audio APIで生成した短いトーンのみを使用し、外部音源ファイルは一切使わない
// （権利上の懸念を避け、低コストで「音が入ると気持ちいいか」を検証する目的）。
// 音量・ON/OFF設定はlocalStorageに永続化する（既存の設定画面がないため独立管理）。
// ============================================================

const STORAGE_KEY = 'chimera-battle:test3:se-settings:v1';

export type SEKind =
  | 'hit'
  | 'hit_big'
  | 'crit'
  | 'fixed'
  | 'heal'
  | 'alpha_strike'
  | 'synergy'
  | 'command'
  | 'guard'
  | 'enemy_charge'
  | 'victory'
  | 'defeat';

interface SESettings {
  enabled: boolean;
  volume: number; // 0..1
}

function loadSettings(): SESettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, volume: 0.5 };
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : 0.5,
    };
  } catch {
    return { enabled: true, volume: 0.5 };
  }
}

let settings: SESettings = loadSettings();
let audioCtx: AudioContext | null = null;
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても致命的ではないため無視する
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

export function setSEEnabled(enabled: boolean) {
  settings = { ...settings, enabled };
  persist();
  notify();
}

export function setSEVolume(volume: number) {
  settings = { ...settings, volume: Math.min(1, Math.max(0, volume)) };
  persist();
  notify();
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

interface Tone {
  freq: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
}

// 各SE種別ごとの簡易トーン定義（複数トーンを連ねて「攻撃感」「達成感」を表現する）
const TONE_TABLE: Record<SEKind, Tone[]> = {
  hit: [{ freq: 220, duration: 0.06, type: 'square', gain: 0.5 }],
  hit_big: [{ freq: 140, duration: 0.12, type: 'square', gain: 0.7, slideTo: 90 }],
  crit: [
    { freq: 660, duration: 0.05, type: 'square', gain: 0.6 },
    { freq: 990, duration: 0.08, type: 'square', gain: 0.6 },
  ],
  fixed: [{ freq: 330, duration: 0.05, type: 'triangle', gain: 0.5 }],
  heal: [
    { freq: 523, duration: 0.08, type: 'sine', gain: 0.4 },
    { freq: 659, duration: 0.12, type: 'sine', gain: 0.4 },
  ],
  alpha_strike: [
    { freq: 200, duration: 0.05, type: 'sawtooth', gain: 0.7 },
    { freq: 400, duration: 0.05, type: 'sawtooth', gain: 0.7 },
    { freq: 800, duration: 0.15, type: 'sawtooth', gain: 0.7, slideTo: 1200 },
  ],
  synergy: [
    { freq: 440, duration: 0.06, type: 'sine', gain: 0.5 },
    { freq: 554, duration: 0.06, type: 'sine', gain: 0.5 },
    { freq: 659, duration: 0.15, type: 'sine', gain: 0.5 },
  ],
  command: [{ freq: 300, duration: 0.06, type: 'square', gain: 0.4, slideTo: 500 }],
  guard: [{ freq: 180, duration: 0.15, type: 'sine', gain: 0.5, slideTo: 220 }],
  enemy_charge: [{ freq: 150, duration: 0.05, type: 'square', gain: 0.35 }],
  victory: [
    { freq: 523, duration: 0.1, type: 'sine', gain: 0.5 },
    { freq: 659, duration: 0.1, type: 'sine', gain: 0.5 },
    { freq: 784, duration: 0.1, type: 'sine', gain: 0.5 },
    { freq: 1047, duration: 0.3, type: 'sine', gain: 0.5 },
  ],
  defeat: [
    { freq: 300, duration: 0.2, type: 'sawtooth', gain: 0.5, slideTo: 100 },
  ],
};

let lastPlayedAt: Partial<Record<SEKind, number>> = {};
// 同種SEの過剰な同時発音を防ぐ最小間隔（多腕一斉ヒット等での音割れ・処理負荷対策）
const MIN_INTERVAL_MS: Partial<Record<SEKind, number>> = { hit: 35, fixed: 60, crit: 80 };

export function playSE(kind: SEKind) {
  if (!settings.enabled || settings.volume <= 0) return;
  const now = performance.now();
  const minInterval = MIN_INTERVAL_MS[kind];
  if (minInterval && lastPlayedAt[kind] !== undefined && now - lastPlayedAt[kind]! < minInterval) return;
  lastPlayedAt[kind] = now;

  const ctx = getCtx();
  if (!ctx) return;
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
}
