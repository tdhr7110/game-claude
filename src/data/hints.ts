// ============================================================
// 場面別ワンポイントヒント
// 「常時説明画面」ではなく、該当する場面に到達した最初の1回だけ
// 1メッセージを表示するための定義。既読状態はローカルに保存し、
// 設定画面からリセットできる（GameContext / storage.ts 参照）。
// ============================================================

export type HintSceneId =
  | 'first_enemy'
  | 'first_part'
  | 'capacity_over'
  | 'first_command'
  | 'command_evolve'
  | 'first_synergy'
  | 'first_save'
  | 'first_defeat';

export interface HintDef {
  id: HintSceneId;
  icon: string;
  text: string;
}

export const HINTS: Record<HintSceneId, HintDef> = {
  first_enemy: {
    id: 'first_enemy',
    icon: '⚔️',
    text: 'これから挑む敵の情報が上に表示されています。準備ができたら「次の戦闘を開始する」をタップ！',
  },
  first_part: {
    id: 'first_part',
    icon: '🎁',
    text: '敵を倒すと部位を獲得できます。カードをタップして詳細を確認し、装着するか保管するか選びましょう。',
  },
  capacity_over: {
    id: 'capacity_over',
    icon: '🔗',
    text: '接続容量が足りません。他の部位を外すか、より軽い部位に入れ替えましょう。',
  },
  first_command: {
    id: 'first_command',
    icon: '⚡',
    text: '新しいコマンドが解放されました。戦闘中はゲージが溜まったコマンドをタップして発動できます。',
  },
  command_evolve: {
    id: 'command_evolve',
    icon: '✨',
    text: '部位の組み合わせによってコマンドが進化しました。より強力な効果に変化しています。',
  },
  first_synergy: {
    id: 'first_synergy',
    icon: '⭐',
    text: '同じ種類・種族の部位を集めるとシナジーが発動します。下部ナビの「シナジー」で確認できます。',
  },
  first_save: {
    id: 'first_save',
    icon: '🔖',
    text: 'ここから進行状況は自動的に保存されます。次回はタイトル画面の「つづきから」で再開できます。',
  },
  first_defeat: {
    id: 'first_defeat',
    icon: '💀',
    text: '敗北すると装着していた部位はリセットされますが、キメラは図鑑に記録できます。また挑戦しましょう。',
  },
};

export const ALL_HINT_SCENE_IDS: HintSceneId[] = Object.keys(HINTS) as HintSceneId[];
