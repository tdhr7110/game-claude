// ============================================================
// コマンドバトルTEST専用の敵データ（本線のオートバトル敵とは完全に独立）。
// 行動パターンは固定の周回配列とし、毎ターン「次に実行される行動」を
// そのまま画面に予告表示できるようにする(ランダム行動は今回未対応)。
// ============================================================

export interface TurnEnemyMove {
  id: string;
  name: string;
  icon: string;
  telegraph: string; // コマンド選択前に表示する予告文
  damage: number; // 0 = 無ダメージの行動(タメ・防御など)
  poison?: number; // このターンでプレイヤーに付与する毒
}

export interface TurnEnemyDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  maxHp: number;
  defense: number; // プレイヤーの攻撃から一律で引く固定値(最終ダメージは最低1)
  pattern: TurnEnemyMove[]; // この配列を周回する
}

export const POISON_SPIDER: TurnEnemyDef = {
  id: 'turn_poison_spider',
  name: '毒蜘蛛',
  icon: '🕷️',
  description: 'HPは低いが毒を継続的に付与してくる。速攻で沈めるのが有効。',
  maxHp: 34,
  defense: 0,
  pattern: [
    { id: 'bite', name: '通常攻撃', icon: '🦷', telegraph: '通常攻撃／7ダメージ', damage: 7 },
    { id: 'poison_fang', name: '毒針', icon: '☠️', telegraph: '毒針／5ダメージ＋毒3', damage: 5, poison: 3 },
    { id: 'bite2', name: '通常攻撃', icon: '🦷', telegraph: '通常攻撃／7ダメージ', damage: 7 },
    { id: 'poison_fang_strong', name: '強め毒針', icon: '☠️', telegraph: '強め毒針／9ダメージ＋毒5', damage: 9, poison: 5 },
  ],
};

export const ROCK_GOLEM: TurnEnemyDef = {
  id: 'turn_rock_golem',
  name: '岩石ゴーレム',
  icon: '🗿',
  description: 'HPと防御が高い。大攻撃の前には明確な予告があるため、防御技を試すのに向く。',
  maxHp: 58,
  defense: 3,
  pattern: [
    { id: 'slam', name: '通常攻撃', icon: '👊', telegraph: '通常攻撃／6ダメージ', damage: 6 },
    { id: 'charge', name: '力をためる', icon: '💪', telegraph: '力をためている／次の攻撃は大ダメージ', damage: 0 },
    { id: 'big_attack', name: '大地粉砕', icon: '💥', telegraph: '大地粉砕／24ダメージ', damage: 24 },
    { id: 'self_guard', name: '防御', icon: '🛡️', telegraph: '身を守っている／このターンは攻撃してこない', damage: 0 },
  ],
};

export const TURN_ENEMIES: TurnEnemyDef[] = [POISON_SPIDER, ROCK_GOLEM];
