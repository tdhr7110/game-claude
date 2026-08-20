import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { equippedDefs, tierOfCurrentBattle, battleSlotLabel, TOTAL_BATTLES } from '../../engine/run';
import { getPartDef } from '../../data/parts';
import type { EnemyDef, EnemyTier } from '../../data/types';
import { SPECIES_LABELS } from '../../data/types';
import { buildEnemySynergyHint } from '../enemySelectHint';

// TODO(TEST18+): 現状は「戦闘相手を選ぶ画面」専用だが、将来的にはショップ・融合・特殊イベント等の
// 選択肢も並ぶ「次の行き先を選ぶ画面」へ拡張する予定(要件7)。今回は大規模リファクタリングを
// 避けるため見送るが、拡張する際は候補リストの要素を「敵専用のEnemyDef」ではなく
// {kind:'battle', enemy} | {kind:'shop'} | {kind:'event', ...} のような判別共用体にし、
// このEnemySelectScreen自体もPrepScreen同様の「フェーズ選択画面」として汎用化するのが
// 既存の型(RunState.phase/enemyCandidates)への影響が最も小さい進め方になる見込み。
const TIER_LABELS: Record<EnemyTier, string> = {
  normal: '通常',
  elite: '強敵',
  miniboss: '中ボス',
  boss: 'ボス',
};

// TEST18: 敵選択画面の情報過多を解消するため、常時表示は「敵名・種別・最低限の危険度・
// 主なドロップ」に絞る。危険度はtierをそのまま星の数へ変換した簡易表示(敵データ自体は変更しない)。
const DANGER_LABELS: Record<EnemyTier, string> = {
  normal: '★☆☆',
  elite: '★★☆',
  miniboss: '★★★',
  boss: '★★★★',
};

// 攻撃部位(interval>0)から平均攻撃力・平均間隔のおおよその目安を計算する(演出用の簡易値)。
function estimateAttack(enemy: EnemyDef): { avgAttack: number; avgInterval: number; dps: number } {
  const moves = enemy.moves.filter((m) => m.attack > 0 && m.interval > 0);
  if (moves.length === 0) return { avgAttack: 0, avgInterval: 0, dps: 0 };
  const avgAttack = moves.reduce((s, m) => s + m.attack, 0) / moves.length;
  const avgInterval = moves.reduce((s, m) => s + m.interval, 0) / moves.length;
  const dps = moves.reduce((s, m) => s + m.attack / m.interval, 0);
  return { avgAttack: Math.round(avgAttack * 10) / 10, avgInterval: Math.round(avgInterval * 100) / 100, dps: Math.round(dps * 10) / 10 };
}

function EnemyCandidateCard({
  enemy,
  selected,
  eqDefs,
  onSelect,
}: {
  enemy: EnemyDef;
  selected: boolean;
  eqDefs: ReturnType<typeof equippedDefs>;
  onSelect: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const { avgAttack, avgInterval, dps } = estimateAttack(enemy);
  const bodyParts = enemy.bodyPartIds.map(getPartDef);
  const rareParts = enemy.rareDropPartIds.map(getPartDef);
  const hint = useMemo(() => buildEnemySynergyHint(enemy, eqDefs), [enemy, eqDefs]);
  const speciesLabel = enemy.species === 'chimera' ? 'キメラ' : SPECIES_LABELS[enemy.species];
  const mainDrops = [...bodyParts.slice(0, 3), ...rareParts.slice(0, 1)];
  const moreDropCount = bodyParts.length + rareParts.length - mainDrops.length;

  return (
    <div className={`enemy-select-card${selected ? ' enemy-select-card--selected' : ''}`}>
      <button type="button" className="enemy-select-card__main" onClick={onSelect}>
        <div className="enemy-select-card__head">
          <span className="enemy-select-card__icon" style={{ color: enemy.color }}>
            {enemy.icon}
          </span>
          <div className="enemy-select-card__title">
            <div className="enemy-select-card__name">{enemy.name}</div>
            <div className="muted">
              {speciesLabel} ・ {TIER_LABELS[enemy.tier]}
            </div>
          </div>
          <span className="enemy-select-card__danger" title="危険度">
            {DANGER_LABELS[enemy.tier]}
          </span>
        </div>

        <div className="enemy-select-card__section-title">🦴 主なドロップ</div>
        <div className="enemy-select-card__part-chips">
          {mainDrops.map((p) => (
            <span key={p.id} className={`chip${rareParts.includes(p) ? ' chip--rare' : ''}`}>
              {p.icon} {p.name}
            </span>
          ))}
          {moreDropCount > 0 && <span className="chip">+{moreDropCount}</span>}
        </div>
      </button>

      <button
        type="button"
        className="btn btn--small btn--ghost enemy-select-card__toggle"
        onClick={(e) => {
          e.stopPropagation();
          setShowDetails((v) => !v);
        }}
      >
        {showDetails ? '詳細を閉じる ▲' : '詳細を見る ▼'}
      </button>

      {showDetails && (
        <div className="enemy-select-card__details">
          <div className="enemy-select-card__stats">
            <span title="HP">❤️ HP{enemy.hp}</span>
            <span title="防御力">🛡️防御{enemy.defense}({enemy.damageReductionPct}%軽減)</span>
            <span title="回避率">💨回避{enemy.evasionPct}%</span>
            <span title="攻撃力の目安">
              ⚔️攻撃力目安 {avgAttack}/{avgInterval}s (DPS≒{dps})
            </span>
          </div>

          <p className="enemy-select-card__desc">{enemy.description}</p>

          <div className="enemy-select-card__section">
            <div className="enemy-select-card__section-title">🌀 固有ギミック</div>
            <p className="muted">{enemy.gimmickSummary}</p>
          </div>

          <div className="enemy-select-card__section">
            <div className="enemy-select-card__section-title">💡 シナジー・コマンドのヒント</div>
            <p className="muted">{hint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function EnemySelectScreen() {
  const { state, dispatch } = useGame();
  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const candidates = state.enemyCandidates;
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  const tier = tierOfCurrentBattle(state);
  const isFixedBoss = tier === 'boss';

  if (candidates.length === 0) {
    return (
      <div className="screen enemy-select-screen">
        <header className="screen__header">
          <h1>⚔️ 敵を選択</h1>
        </header>
        <p className="muted">候補を生成中です…</p>
      </div>
    );
  }

  const selected = candidates.find((c) => c.id === selectedId) ?? candidates[0];

  function confirm() {
    if (!selected) return;
    dispatch({ type: 'CHOOSE_ENEMY', enemyId: selected.id });
  }

  return (
    <div className="screen enemy-select-screen">
      <header className="screen__header">
        <h1>
          ⚔️ 第{state.battleIndex}戦 / 全{TOTAL_BATTLES}戦（{battleSlotLabel(state)}）
        </h1>
      </header>

      <p className="muted enemy-select-screen__lead">
        {isFixedBoss ? 'この敵との戦闘に挑みます。内容を確認して戦闘を開始してください。' : '3体の敵候補から、戦う相手を1体選んでください。'}
      </p>

      <div className="enemy-select-grid">
        {candidates.map((enemy) => (
          <EnemyCandidateCard
            key={enemy.id}
            enemy={enemy}
            selected={selected?.id === enemy.id}
            eqDefs={eqDefs}
            onSelect={() => setSelectedId(enemy.id)}
          />
        ))}
      </div>

      <div className="sticky-cta">
        <button className="btn btn--primary btn--large btn--block" onClick={confirm} disabled={!selected}>
          {isFixedBoss ? '⚔️ 戦闘を開始する' : `⚔️ ${selected?.name ?? ''}と戦う`}
        </button>
      </div>
    </div>
  );
}
