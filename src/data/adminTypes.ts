// ============================================================
// 能力管理基盤（管理画面）専用の型定義。
// ゲーム本体のコア型(types.ts)とは分離し、admin機能を除去しても
// ゲーム側のimportに影響が出ないようにしている。
// ============================================================

import type { PartDef, PartEffect } from './types';

// --- 通常能力(Effect)ビルダー用: 対応するEffect kindのスキーマ ---
// 「Trigger」は各kindに暗黙的に紐づく（例: apply_poison=onHit、heal_tick=periodic）。
// 既存のPartEffect解釈エンジン(modifiers.ts / battle.ts)をそのまま使うため、
// 新しいTrigger/Effect実行エンジンは作らず、既存effects配列を組み立てるUIとして提供する。
export interface EffectFieldSchema {
  key: string;
  label: string;
  type: 'number' | 'percent' | 'partType' | 'text';
  step?: number;
}

export interface EffectKindSchema {
  kind: PartEffect['kind'];
  label: string; // 管理画面表示名
  trigger: string; // 表示用のTrigger名（onHit / periodic / onBattleStart 等）
  fields: EffectFieldSchema[];
}

// --- 特殊能力（Custom Handler方式）---
export interface EditableParamSpec {
  key: string; // このパラメータのUI上の識別子
  label: string;
  type: 'number' | 'percent';
  min?: number;
  max?: number;
  step?: number;
  // このパラメータが実際に対応する、部位のeffects配列中の位置とフィールド名。
  // genericPartEffectParam ハンドラはこれを読み、該当部位のeffects[effectIndex][field] を書き換える。
  effectIndex: number;
  field: string;
}

export interface SpecialAbilityDef {
  id: string; // 対応する部位のPartDef.idと一致させている（1部位=1特殊能力の現状構成に合わせた最小実装）
  name: string;
  description: string;
  tags: string[];
  trigger: string; // 表示用
  handler: string; // specialAbilityHandlersのキー
  editableParams: EditableParamSpec[];
  enabled: boolean;
}

// --- 部位マスターデータの上書き・追加パッチ ---
export type PartPatch = Partial<Omit<PartDef, 'id'>>;

export interface ChangeLogEntry {
  id: string;
  at: number;
  summary: string; // 例: 「毒蜘蛛: 攻撃力 3 → 4」
}

// --- adminStoreの永続化スキーマ（localStorage） ---
export interface AdminPersistedState {
  version: 1;
  partPatches: Record<string, PartPatch>; // 既存部位への上書き
  customParts: PartDef[]; // 新規作成部位
  disabledPartIds: string[];
  synergyPatches: Record<string, { count?: number; description?: string; effectPatch?: Record<string, number> }[]>;
  // key: `${'partType'|'species'}:${typeOrSpecies}` → tierごとの上書き配列
  changeLog: ChangeLogEntry[];
}
