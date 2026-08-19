import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { ALL_PARTS } from '../../data/parts';
import type { PartDef, PartType, Rarity, Species } from '../../data/types';
import { PART_TYPE_LABELS, RARITY_LABELS, SPECIES_LABELS } from '../../data/types';
import { isPartDiscovered, commandsForPart, TOTAL_PART_COUNT } from '../../engine/codex';
import { getCommandDef } from '../../data/commandDefs';
import { PartCard } from './PartCard';
import { PartDetailPanel } from './PartDetailPanel';

type DiscoveryFilter = 'all' | 'discovered' | 'undiscovered';

const TYPE_OPTIONS: PartType[] = ['arm', 'head', 'heart', 'leg', 'skin'];
const SPECIES_OPTIONS: Species[] = ['insect', 'golem', 'dragon', 'none'];
const RARITY_OPTIONS: Rarity[] = ['common', 'uncommon', 'rare'];

function LockedPartCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="part-card part-card--compact part-card--locked" onClick={onClick} title="未発見の部位">
      <div className="part-card__icon part-card__icon--locked">？</div>
      <div className="part-card__name">？？？</div>
      <div className="part-card__meta">
        <span className="chip">未発見</span>
      </div>
    </button>
  );
}

export function PartCodexPanel() {
  const { codex } = useGame();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<PartType | 'all'>('all');
  const [speciesFilter, setSpeciesFilter] = useState<Species | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [discoveryFilter, setDiscoveryFilter] = useState<DiscoveryFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const discoveredCount = useMemo(() => ALL_PARTS.filter((p) => isPartDiscovered(codex, p.id)).length, [codex]);

  const filtered = useMemo(() => {
    const query = search.trim();
    return ALL_PARTS.filter((p) => {
      const discovered = isPartDiscovered(codex, p.id);
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (speciesFilter !== 'all' && p.species !== speciesFilter) return false;
      if (rarityFilter !== 'all' && p.rarity !== rarityFilter) return false;
      if (discoveryFilter === 'discovered' && !discovered) return false;
      if (discoveryFilter === 'undiscovered' && discovered) return false;
      if (query && !p.name.includes(query)) return false;
      return true;
    });
  }, [codex, typeFilter, speciesFilter, rarityFilter, discoveryFilter, search]);

  const selectedDef: PartDef | null = selectedId && isPartDiscovered(codex, selectedId) ? ALL_PARTS.find((p) => p.id === selectedId) ?? null : null;
  const relatedCommands = useMemo(() => (selectedDef ? commandsForPart(selectedDef.id) : []), [selectedDef]);

  return (
    <div className="codex-panel">
      <div className="codex-panel__summary">
        🦴 発見数 {discoveredCount} / {TOTAL_PART_COUNT} 部位
      </div>

      <div className="codex-filters">
        <input
          type="text"
          className="codex-filters__search"
          placeholder="名前で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="codex-filters__row">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PartType | 'all')}>
            <option value="all">種類: すべて</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {PART_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value as Species | 'all')}>
            <option value="all">種族: すべて</option>
            {SPECIES_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SPECIES_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="codex-filters__row">
          <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as Rarity | 'all')}>
            <option value="all">レアリティ: すべて</option>
            {RARITY_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </select>
          <select value={discoveryFilter} onChange={(e) => setDiscoveryFilter(e.target.value as DiscoveryFilter)}>
            <option value="all">発見状況: すべて</option>
            <option value="discovered">発見済みのみ</option>
            <option value="undiscovered">未発見のみ</option>
          </select>
        </div>
      </div>

      <div className="part-grid codex-grid">
        {filtered.map((p) => {
          const discovered = isPartDiscovered(codex, p.id);
          return discovered ? (
            <PartCard
              key={p.id}
              def={p}
              compact
              selected={selectedId === p.id}
              onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
            />
          ) : (
            <LockedPartCard key={p.id} onClick={() => setSelectedId(null)} />
          );
        })}
        {filtered.length === 0 && <p className="muted">条件に一致する部位がありません。</p>}
      </div>

      {selectedDef && (
        <div className="gallery-detail codex-detail">
          <PartDetailPanel def={selectedDef} />
          <div className="codex-detail__commands">
            <div className="muted">⚡ 解放・進化に関わるコマンド</div>
            {relatedCommands.length === 0 && <p className="muted">この部位が直接関わるコマンドはありません。</p>}
            {relatedCommands.map((cmd) => {
              const evolvedFromDef = cmd.evolvedFrom ? getCommandDef(cmd.evolvedFrom) : null;
              return (
                <div key={cmd.commandId} className="codex-command-row">
                  <span className="codex-command-row__name" style={{ color: cmd.color }}>
                    {cmd.icon} {cmd.name}
                  </span>
                  {evolvedFromDef && (
                    <span className="muted codex-command-row__evo">
                      （{evolvedFromDef.icon}
                      {evolvedFromDef.name} から進化）
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
