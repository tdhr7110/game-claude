// ============================================================
// TEST8 優先4: 「異なる壊れ方をする完成ビルド」3系統のデータ定義。
//
// 既存の部位(38種)・コマンド(24種)のみを組み合わせて構成しており、
// このファイル自体は新規の部位・コマンドを一切追加しない
// (無計画な新規部位追加を避け、既存データの組み合わせだけで
// 「壊れ方の違う3つのビルド」を成立させるという要件のための構成データ)。
//
// 各ビルドは3段階(序盤/中盤/完成)を持ち、装着部位が増えるにつれて
// 既存のシナジー・パッシブ効果・コマンド進化が自然に積み重なって
// 壊れた挙動になるよう設計している。scripts/breakBuildTest.ts が
// この定義を直接読み込んで自動検証する。
// ============================================================

export type BreakBuildId = 'multi_arm' | 'plague' | 'reflect_fortress';

export interface BreakBuildStage {
  key: 'early' | 'mid' | 'complete';
  label: string;
  summary: string; // このステージでどう「壊れて」見えるか
  partIds: string[]; // 装着部位(defId。同じidを複数指定すると複数装着扱い)
  commandFamilyIds: (string | null)[]; // 4枠のコマンド編成(familyId)
}

export interface BreakBuildDef {
  id: BreakBuildId;
  name: string;
  concept: string;
  stages: BreakBuildStage[];
}

// ------------------------------------------------------------
// A. 多腕・超連撃型: 腕の物量そのものを暴力に変えるビルド。
// 中核: 多腕核(special_multi_arm_core)・無限肉芽(special_infinite_sarcoma)・
//       暴走遺伝子(special_rampant_gene) + 各種腕部位
// 使用コマンド: 全腕斉射・百腕乱舞・狂化・全器官解放
// 壊れ方: 腕シナジー(6本コンボ・10本追撃)と狂化・暴走遺伝子の二重発動が
//         積み重なり、HIT数と実質攻撃速度が指数的に増える。
// ------------------------------------------------------------
const MULTI_ARM_BUILD: BreakBuildDef = {
  id: 'multi_arm',
  name: '多腕・超連撃型',
  concept: '腕を増やすほど、攻撃速度と追加発動が雪だるま式に増えていく物量ビルド',
  stages: [
    {
      key: 'early',
      label: '序盤: 腕が増え始める',
      summary: '腕3本+多腕核で全腕斉射・狂化が解放される。まだ単発の強さ止まり。',
      partIds: ['insect_sickle_arm', 'insect_sickle_arm', 'insect_sickle_arm', 'special_multi_arm_core'],
      commandFamilyIds: ['allarms', 'frenzy', 'strike', null],
    },
    {
      key: 'mid',
      label: '中盤: コンボが連鎖し始める',
      summary: '腕6本で「6回攻撃毎に全腕追加攻撃」シナジーが発動し、百腕乱舞も解放される。',
      partIds: [
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'special_multi_arm_core',
        'special_infinite_sarcoma',
      ],
      commandFamilyIds: ['allarms', 'frenzy', 'strike', null],
    },
    {
      key: 'complete',
      label: '完成: 明確に壊れた連撃',
      summary:
        '腕10本で追撃シナジーも重なり、暴走遺伝子の二重発動・狂化の攻撃速度アップ・百腕乱舞が同時に噛み合ってHIT数が爆発する。',
      partIds: [
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'insect_sickle_arm',
        'special_multi_arm_core',
        'special_rampant_gene',
        'special_infinite_sarcoma',
      ],
      commandFamilyIds: ['allarms', 'frenzy', 'ultimate', null],
    },
  ],
};

// ------------------------------------------------------------
// B. 疫病・毒爆発型: 毒を溜めて任意のタイミングで爆発させるビルド。
// 中核: 毒腺(insect_poison_gland)・毒針腕(insect_poison_needle_arm)・
//       女王の腹部(insect_queen_abdomen)・疫病核(special_plague_core)・
//       群体意識(special_hive_mind)
// 使用コマンド: 毒爆発・疫病爆発・毒液分泌・神経麻痺
// 壊れ方: 毒を減衰させずに大量蓄積し、疫病爆発で一気に解放する。
// ------------------------------------------------------------
const PLAGUE_BUILD: BreakBuildDef = {
  id: 'plague',
  name: '疫病・毒爆発型',
  concept: '毒を減らさずに溜め続け、任意のタイミングで大爆発させる時限爆弾ビルド',
  stages: [
    {
      key: 'early',
      label: '序盤: 毒が乗り始める',
      summary: '毒針腕+毒腺で毒が蓄積し始め、毒爆発が解放される。',
      partIds: ['insect_poison_needle_arm', 'insect_poison_gland'],
      commandFamilyIds: ['poisonburst', 'strike', 'guard', null],
    },
    {
      key: 'mid',
      label: '中盤: 毒が減らなくなる',
      summary: '疫病核で毒の減衰がほぼ止まり、女王の腹部で付与量も増加。疫病爆発に進化する。',
      partIds: ['insect_poison_needle_arm', 'insect_poison_needle_arm', 'insect_poison_gland', 'special_plague_core', 'insect_queen_abdomen'],
      commandFamilyIds: ['poisonburst', 'venomsecretion', 'guard', null],
    },
    {
      key: 'complete',
      label: '完成: 大爆発',
      summary: '毒針腕を増量し神経麻痺で敵を止めている間に毒を極限まで溜め、疫病爆発で一気に大ダメージを叩き込む。',
      partIds: [
        'insect_poison_needle_arm',
        'insect_poison_needle_arm',
        'insect_poison_needle_arm',
        'insect_poison_gland',
        'special_plague_core',
        'insect_queen_abdomen',
        'insect_web_mouth',
        'special_hive_mind',
      ],
      commandFamilyIds: ['poisonburst', 'venomsecretion', 'paralysis', null],
    },
  ],
};

// ------------------------------------------------------------
// C. 不死・反射要塞型: 瀕死から復活し、大攻撃を反射で返り討ちにするビルド。
// 中核: 巨大心臓(special_colossal_heart)・百足の心臓(special_centipede_heart)・
//       無限肉芽(special_infinite_sarcoma)・反射装甲(golem_reflect_armor)・
//       古代核(golem_ancient_core)
// 使用コマンド: 多重鼓動・竜脈再生・硬質化・反射甲殻
// 壊れ方: 心臓5個で「致死ダメージ時に復活」シナジーが発動し、
//         反射甲殻で被弾のたびに敵へダメージを跳ね返す。
// ------------------------------------------------------------
const REFLECT_FORTRESS_BUILD: BreakBuildDef = {
  id: 'reflect_fortress',
  name: '不死・反射要塞型',
  concept: '心臓を積み上げて致死から復活しつつ、反射甲殻で大攻撃をそのまま打ち返す要塞ビルド',
  stages: [
    {
      key: 'early',
      label: '序盤: 硬さが見える',
      summary: '反射装甲1枚+巨大心臓で硬質化が解放される。防御方向性が見える。',
      partIds: ['golem_reflect_armor', 'special_colossal_heart'],
      commandFamilyIds: ['harden', 'strike', 'guard', null],
    },
    {
      key: 'mid',
      label: '中盤: 反射と鼓動が連鎖し始める',
      summary: '反射装甲2枚目で反射甲殻に進化し、心臓2個で多重鼓動も解放される。',
      partIds: ['golem_reflect_armor', 'golem_reflect_armor', 'special_colossal_heart', 'special_centipede_heart'],
      commandFamilyIds: ['harden', 'heartbeat', 'guard', null],
    },
    {
      key: 'complete',
      label: '完成: 瀕死からの逆転要塞',
      summary:
        '心臓5個で「致死ダメージ時にHP20%で復活」が発動し、古代核・無限肉芽が支える中で反射甲殻と竜脈再生を回して瀕死から一気に押し返す。',
      partIds: [
        'golem_reflect_armor',
        'golem_reflect_armor',
        'special_colossal_heart',
        'special_centipede_heart',
        'dragon_heart',
        'golem_ancient_core',
        'special_infinite_sarcoma',
      ],
      commandFamilyIds: ['harden', 'heartbeat', 'guard', null],
    },
  ],
};

export const BREAK_BUILDS: BreakBuildDef[] = [MULTI_ARM_BUILD, PLAGUE_BUILD, REFLECT_FORTRESS_BUILD];

export function getBreakBuild(id: BreakBuildId): BreakBuildDef {
  const found = BREAK_BUILDS.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown break build id: ${id}`);
  return found;
}
