import { useState } from 'react';
import { PartCodexPanel } from './PartCodexPanel';
import { EnemyCodexPanel } from './EnemyCodexPanel';
import { ChimeraGalleryPanel } from './ChimeraGalleryModal';
import '../codex.css';

interface CodexModalProps {
  onClose: () => void;
}

type CodexTab = 'part' | 'enemy' | 'chimera';

const TABS: { id: CodexTab; icon: string; label: string }[] = [
  { id: 'part', icon: '🦴', label: '部位' },
  { id: 'enemy', icon: '👹', label: '敵' },
  { id: 'chimera', icon: '🏛️', label: 'キメラ' },
];

// 収集図鑑(優先7): 部位図鑑・敵図鑑・命名キメラ図鑑をタブで切り替える統合モーダル。
// 既存の命名キメラ図鑑(ChimeraGalleryPanel)はそのまま「キメラ」タブとして統合する。
export function CodexModal({ onClose }: CodexModalProps) {
  const [tab, setTab] = useState<CodexTab>('chimera');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card codex-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 style={{ margin: 0, fontSize: '1.1em' }}>📖 図鑑</h2>
          <button className="modal-card__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="codex-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`codex-tabs__item${tab === t.id ? ' codex-tabs__item--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="codex-modal__body">
          {tab === 'part' && <PartCodexPanel />}
          {tab === 'enemy' && <EnemyCodexPanel />}
          {tab === 'chimera' && <ChimeraGalleryPanel />}
        </div>
      </div>
    </div>
  );
}
