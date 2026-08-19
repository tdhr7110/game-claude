import { useEffect, useState } from 'react';
import { useGame } from '../GameContext';
import { ALL_PARTS, getPartDef } from '../../data/parts';
import { ENEMY_CATALOG, type EnemyCatalogEntry } from '../../data/enemyCatalog';
import {
  partCollectionRates,
  enemyCollectionRates,
  commandsRequiringPart,
  ENEMY_CATEGORY_LABELS,
  type CategoryRate,
  type CollectionCategory,
  type EnemyCategory,
} from '../../data/collectionCategories';
import { getPartArtUrl, getEnemyArtUrl, SILHOUETTE_ART_URL } from '../collectionArt';
import { CollectionArtImage } from './CollectionArtImage';
import { PartDetailPanel } from './PartDetailPanel';
import { ChimeraGalleryTab } from './ChimeraGalleryModal';
import { speciesLabel, formatDateTime, tagLabel } from '../format';
import type { PartDef } from '../../data/types';

type CollectionTab = 'parts' | 'enemies' | 'chimera';

interface CollectionModalProps {
  onClose: () => void;
  initialTab?: CollectionTab;
}

const TAB_ITEMS: { id: CollectionTab; icon: string; label: string }[] = [
  { id: 'parts', icon: '🦴', label: '部位図鑑' },
  { id: 'enemies', icon: '👹', label: '敵図鑑' },
  { id: 'chimera', icon: '🏛️', label: 'キメラ図鑑' },
];

export function CollectionModal({ onClose, initialTab = 'parts' }: CollectionModalProps) {
  const { collection, markPartsSeen, markEnemiesSeen } = useGame();
  const [tab, setTab] = useState<CollectionTab>(initialTab);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);

  // NEWバッジは該当タブを開いたタイミングで既読にする(コマンド図鑑と同じ既存の挙動に合わせる)。
  useEffect(() => {
    if (tab === 'parts' && collection.unseenPartIds.length > 0) markPartsSeen();
    if (tab === 'enemies' && collection.unseenEnemyIds.length > 0) markEnemiesSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const discoveredPartIds = new Set(Object.keys(collection.parts));
  const discoveredEnemyIds = new Set(Object.keys(collection.enemies));
  const partRates = partCollectionRates(discoveredPartIds);
  const enemyRates = enemyCollectionRates(discoveredEnemyIds);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card gallery-card collection-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 style={{ margin: 0, fontSize: '1.1em' }}>📖 図鑑</h2>
          <button className="modal-card__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="collection-tabs">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`collection-tabs__item${tab === item.id ? ' collection-tabs__item--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon} {item.label}
              {item.id === 'parts' && ` (${partRates.reduce((a, r) => a + r.discovered, 0)}/${ALL_PARTS.length})`}
              {item.id === 'enemies' && ` (${enemyRates.reduce((a, r) => a + r.discovered, 0)}/${ENEMY_CATALOG.length})`}
              {item.id === 'chimera' && ` (${collection.chimeras.length})`}
            </button>
          ))}
        </div>

        {tab === 'parts' && (
          <PartsTab
            rates={partRates}
            discoveredPartIds={discoveredPartIds}
            selectedPartId={selectedPartId}
            onSelect={setSelectedPartId}
            collectionParts={collection.parts}
          />
        )}
        {tab === 'enemies' && (
          <EnemiesTab
            rates={enemyRates}
            discoveredEnemyIds={discoveredEnemyIds}
            selectedEnemyId={selectedEnemyId}
            onSelect={setSelectedEnemyId}
            collectionEnemies={collection.enemies}
          />
        )}
        {tab === 'chimera' && <ChimeraGalleryTab />}
      </div>
    </div>
  );
}

function CategoryRateBar({ rate, label }: { rate: CategoryRate<CollectionCategory> | CategoryRate<EnemyCategory>; label: string }) {
  return (
    <div className="collection-rate-row">
      <span className="collection-rate-row__label">{label}</span>
      <div className="collection-rate-row__bar">
        <div className="collection-rate-row__fill" style={{ width: `${rate.pct}%` }} />
      </div>
      <span className="collection-rate-row__value">
        {rate.discovered}/{rate.total} ({rate.pct}%)
      </span>
    </div>
  );
}

function PartsTab({
  rates,
  discoveredPartIds,
  selectedPartId,
  onSelect,
  collectionParts,
}: {
  rates: CategoryRate<CollectionCategory>[];
  discoveredPartIds: Set<string>;
  selectedPartId: string | null;
  onSelect: (id: string | null) => void;
  collectionParts: Record<string, { firstAcquiredAt: number; runsDiscovered: number }>;
}) {
  const selectedDef = selectedPartId ? getPartDef(selectedPartId) : null;
  const selectedDiscovery = selectedPartId ? collectionParts[selectedPartId] : undefined;
  const relatedCommands = selectedPartId ? commandsRequiringPart(selectedPartId) : [];

  return (
    <div>
      <div className="collection-rates">
        {rates.map((r) => (
          <CategoryRateBar key={r.category} rate={r} label={speciesLabel(r.category)} />
        ))}
      </div>
      <div className="collection-grid">
        {ALL_PARTS.map((def: PartDef) => {
          const discovered = discoveredPartIds.has(def.id);
          const artUrl = discovered ? getPartArtUrl(def.id) : SILHOUETTE_ART_URL;
          return (
            <button
              key={def.id}
              type="button"
              className={`collection-tile${discovered ? '' : ' collection-tile--undiscovered'}${selectedPartId === def.id ? ' collection-tile--selected' : ''}`}
              onClick={() => discovered && onSelect(def.id)}
              disabled={!discovered}
              title={discovered ? def.name : '未発見'}
            >
              <CollectionArtImage
                url={artUrl}
                fallbackIcon={discovered ? def.icon : '❓'}
                fallbackColor={discovered ? def.color : undefined}
                alt={discovered ? def.name : '未発見の部位'}
                className="collection-tile__art"
              />
              <span className="collection-tile__name">{discovered ? def.name : '？？？'}</span>
            </button>
          );
        })}
      </div>
      {selectedDef && (
        <div className="gallery-detail">
          {selectedDiscovery && (
            <div className="collection-discovery-meta">
              <span>🕒 初入手: {formatDateTime(selectedDiscovery.firstAcquiredAt)}</span>
              <span>🔁 発見したラン数: {selectedDiscovery.runsDiscovered}</span>
            </div>
          )}
          <PartDetailPanel def={selectedDef} />
          <div className="collection-related-commands">
            <div className="muted">⚡ 関連コマンド</div>
            {relatedCommands.length === 0 ? (
              <p className="muted">この部位が関係するコマンドはありません</p>
            ) : (
              relatedCommands.map((cmd) => (
                <div key={cmd.commandId} className="collection-related-commands__row">
                  <span style={{ color: cmd.color }}>{cmd.icon}</span> {cmd.name}
                  <span className="muted"> — {cmd.description}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnemiesTab({
  rates,
  discoveredEnemyIds,
  selectedEnemyId,
  onSelect,
  collectionEnemies,
}: {
  rates: CategoryRate<EnemyCategory>[];
  discoveredEnemyIds: Set<string>;
  selectedEnemyId: string | null;
  onSelect: (id: string | null) => void;
  collectionEnemies: Record<string, { firstAcquiredAt: number; runsDiscovered: number }>;
}) {
  const selected: EnemyCatalogEntry | undefined = selectedEnemyId ? ENEMY_CATALOG.find((e) => e.id === selectedEnemyId) : undefined;
  const selectedDiscovery = selectedEnemyId ? collectionEnemies[selectedEnemyId] : undefined;

  return (
    <div>
      <div className="collection-rates">
        {rates.map((r) => (
          <CategoryRateBar key={r.category} rate={r} label={ENEMY_CATEGORY_LABELS[r.category]} />
        ))}
      </div>
      <div className="collection-grid">
        {ENEMY_CATALOG.map((entry) => {
          const discovered = discoveredEnemyIds.has(entry.id);
          const artUrl = discovered ? getEnemyArtUrl(entry.id) : SILHOUETTE_ART_URL;
          return (
            <button
              key={entry.id}
              type="button"
              className={`collection-tile${discovered ? '' : ' collection-tile--undiscovered'}${selectedEnemyId === entry.id ? ' collection-tile--selected' : ''}`}
              onClick={() => discovered && onSelect(entry.id)}
              disabled={!discovered}
              title={discovered ? entry.name : '未発見'}
            >
              <CollectionArtImage
                url={artUrl}
                fallbackIcon={discovered ? entry.icon : '❓'}
                fallbackColor={discovered ? entry.color : undefined}
                alt={discovered ? entry.name : '未発見の敵'}
                className="collection-tile__art"
              />
              <span className="collection-tile__name">{discovered ? entry.name : '？？？'}</span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="gallery-detail">
          {selectedDiscovery && (
            <div className="collection-discovery-meta">
              <span>🕒 初遭遇: {formatDateTime(selectedDiscovery.firstAcquiredAt)}</span>
              <span>🔁 発見したラン数: {selectedDiscovery.runsDiscovered}</span>
            </div>
          )}
          <div className="detail-panel">
            <div className="detail-panel__header">
              <span className="detail-panel__icon" style={{ color: selected.color }}>
                {selected.icon}
              </span>
              <div>
                <div className="detail-panel__name">{selected.name}</div>
                <div className="detail-panel__sub">
                  {selected.species !== 'chimera' ? speciesLabel(selected.species) : 'キメラ'} ・ {selected.tier}
                </div>
              </div>
            </div>
            <p className="detail-panel__desc">{selected.description}</p>
            <div className="muted">⚔️ 能力</div>
            {selected.moves.map((m) => (
              <div key={m.id} className="collection-related-commands__row">
                <span>{m.icon}</span> {m.name} — 威力{m.attack}
                {m.interval > 0 ? ` / ${m.interval}秒毎` : '(パッシブ)'}
                {m.tags.length > 0 && <span className="muted"> [{m.tags.map(tagLabel).join('・')}]</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
