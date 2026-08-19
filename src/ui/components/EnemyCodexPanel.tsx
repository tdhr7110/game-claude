import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { ENEMY_ROSTER, TOTAL_ENEMY_COUNT, type EnemyRosterEntry } from '../../data/enemyRoster';
import type { EnemyTier, Species } from '../../data/types';
import { SPECIES_LABELS, TAG_LABELS } from '../../data/types';
import { discoveredEnemyCount, isEnemyDefeated, isEnemyEncountered } from '../../engine/codex';

type DiscoveryFilter = 'all' | 'discovered' | 'undiscovered';

const TIER_LABELS: Record<EnemyTier, string> = {
  normal: '通常',
  elite: '強敵',
  miniboss: '中ボス',
  boss: 'ボス',
};

function speciesFilterLabel(s: Species | 'chimera'): string {
  return s === 'chimera' ? 'キメラ' : SPECIES_LABELS[s];
}

function EnemyCard({
  entry,
  encountered,
  defeated,
  selected,
  onClick,
}: {
  entry: EnemyRosterEntry;
  encountered: boolean;
  defeated: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  if (!encountered) {
    return (
      <button type="button" className="enemy-card enemy-card--locked" onClick={onClick} title="未発見の敵">
        <div className="enemy-card__icon enemy-card__icon--locked">？</div>
        <div className="enemy-card__name">？？？</div>
        <div className="enemy-card__meta">
          <span className="chip">未発見</span>
        </div>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`enemy-card enemy-card--tier-${entry.tier}${selected ? ' enemy-card--selected' : ''}`}
      onClick={onClick}
      title={entry.name}
    >
      <div className="enemy-card__icon" style={{ color: entry.color }}>
        {entry.icon}
      </div>
      <div className="enemy-card__name">{entry.name}</div>
      <div className="enemy-card__meta">
        <span className="chip">{TIER_LABELS[entry.tier]}</span>
        <span className="chip">{speciesFilterLabel(entry.species)}</span>
        {!defeated && <span className="chip enemy-card__unknown-chip">詳細未解放</span>}
      </div>
    </button>
  );
}

export function EnemyCodexPanel() {
  const { codex } = useGame();
  const [tierFilter, setTierFilter] = useState<EnemyTier | 'all'>('all');
  const [speciesFilter, setSpeciesFilter] = useState<Species | 'chimera' | 'all'>('all');
  const [discoveryFilter, setDiscoveryFilter] = useState<DiscoveryFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const speciesOptions = useMemo(() => Array.from(new Set(ENEMY_ROSTER.map((e) => e.species))), []);

  const filtered = useMemo(() => {
    return ENEMY_ROSTER.filter((e) => {
      const encountered = isEnemyEncountered(codex, e.id);
      if (tierFilter !== 'all' && e.tier !== tierFilter) return false;
      if (speciesFilter !== 'all' && e.species !== speciesFilter) return false;
      if (discoveryFilter === 'discovered' && !encountered) return false;
      if (discoveryFilter === 'undiscovered' && encountered) return false;
      return true;
    });
  }, [codex, tierFilter, speciesFilter, discoveryFilter]);

  const selectedEntry = selectedId ? ENEMY_ROSTER.find((e) => e.id === selectedId) ?? null : null;
  const selectedEncountered = selectedEntry ? isEnemyEncountered(codex, selectedEntry.id) : false;
  const selectedDefeated = selectedEntry ? isEnemyDefeated(codex, selectedEntry.id) : false;
  const selectedRecord = selectedEntry ? codex.enemyEntries[selectedEntry.id] : undefined;

  return (
    <div className="codex-panel">
      <div className="codex-panel__summary">
        👹 発見数 {discoveredEnemyCount(codex)} / {TOTAL_ENEMY_COUNT} 体
      </div>

      <div className="codex-filters">
        <div className="codex-filters__row">
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as EnemyTier | 'all')}>
            <option value="all">ランク: すべて</option>
            {(Object.keys(TIER_LABELS) as EnemyTier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value as Species | 'chimera' | 'all')}>
            <option value="all">種族: すべて</option>
            {speciesOptions.map((s) => (
              <option key={s} value={s}>
                {speciesFilterLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="codex-filters__row">
          <select value={discoveryFilter} onChange={(e) => setDiscoveryFilter(e.target.value as DiscoveryFilter)}>
            <option value="all">発見状況: すべて</option>
            <option value="discovered">発見済みのみ</option>
            <option value="undiscovered">未発見のみ</option>
          </select>
        </div>
      </div>

      <div className="enemy-grid codex-grid">
        {filtered.map((e) => {
          const encountered = isEnemyEncountered(codex, e.id);
          const defeated = isEnemyDefeated(codex, e.id);
          return (
            <EnemyCard
              key={e.id}
              entry={e}
              encountered={encountered}
              defeated={defeated}
              selected={selectedId === e.id}
              onClick={() => (encountered ? setSelectedId(e.id === selectedId ? null : e.id) : setSelectedId(null))}
            />
          );
        })}
        {filtered.length === 0 && <p className="muted">条件に一致する敵がいません。</p>}
      </div>

      {selectedEntry && selectedEncountered && (
        <div className="gallery-detail codex-detail enemy-detail">
          <div className="enemy-detail__header">
            <span className="enemy-detail__icon" style={{ color: selectedEntry.color }}>
              {selectedEntry.icon}
            </span>
            <div>
              <div className="enemy-detail__name">{selectedEntry.name}</div>
              <div className="muted">
                {TIER_LABELS[selectedEntry.tier]} ・ {speciesFilterLabel(selectedEntry.species)}
              </div>
            </div>
          </div>
          <div className="muted enemy-detail__counts">
            👁️ 遭遇回数 {selectedRecord?.encounterCount ?? 0}回 ・ 💀 撃破回数 {selectedRecord?.defeatCount ?? 0}回
          </div>

          {selectedDefeated ? (
            <>
              <p className="detail-panel__desc">{selectedEntry.description}</p>
              <div className="enemy-detail__moves">
                <div className="muted">⚔️ 能力</div>
                {selectedEntry.moves.map((m) => (
                  <div key={m.id} className="codex-command-row">
                    <span className="codex-command-row__name">
                      {m.icon} {m.name}
                    </span>
                    <span className="muted">
                      攻撃力{m.attack} ・ {m.interval === 0 ? 'パッシブ' : `間隔${m.interval}秒`}
                      {m.tags.length > 0 && ` ・ ${m.tags.map((t) => TAG_LABELS[t]).join('・')}`}
                    </span>
                  </div>
                ))}
              </div>
              {selectedEntry.heldPartIds && selectedEntry.heldPartIds.length > 0 && (
                <div className="enemy-detail__parts">
                  <div className="muted">🦴 所持部位</div>
                  <div>{selectedEntry.heldPartIds.join('、')}</div>
                </div>
              )}
            </>
          ) : (
            <p className="muted">詳細情報は初撃破で解放されます。まずは一度倒してみましょう。</p>
          )}
        </div>
      )}
    </div>
  );
}
