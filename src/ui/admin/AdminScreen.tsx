import { useEffect, useState } from 'react';
import { subscribe } from '../../engine/adminStore';
import { PartsTab } from './PartsTab';
import { SpecialAbilitiesTab } from './SpecialAbilitiesTab';
import { SynergyTab } from './SynergyTab';
import { DataToolsTab } from './DataToolsTab';

type Tab = 'parts' | 'abilities' | 'special' | 'data';

// テスト版限定のBALANCE管理画面。正式版のビルドにも同じコードは含まれるが、
// production/game-claude では #admin ハッシュへの導線（デバッグパネルのリンク）自体を
// 用意していないため実質到達できない。test/chimera-butcher-update-1 のみでの利用を想定している。
export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('parts');
  const [, forceUpdate] = useState(0);

  // adminStoreの変更（部位編集・特殊能力パラメータ変更等）で全体を再描画する
  useEffect(() => subscribe(() => forceUpdate((n) => n + 1)), []);

  return (
    <div className="app-root admin-screen">
      <header className="screen__header">
        <h1>⚙️ BALANCE管理画面（テスト版限定）</h1>
        <a className="btn btn--small btn--ghost" href="#">
          ← ゲームに戻る
        </a>
      </header>
      <p className="muted admin-screen__hint">
        ここでの変更はブラウザのlocalStorageにのみ保存され、テスト版の動作へ即座に反映されます。正式版のデータには一切影響しません。
      </p>

      <div className="admin-tabs">
        <button className={`btn btn--small${tab === 'parts' ? ' btn--primary' : ''}`} onClick={() => setTab('parts')}>
          🧩 部位
        </button>
        <button className={`btn btn--small${tab === 'abilities' ? ' btn--primary' : ''}`} onClick={() => setTab('abilities')}>
          ✨ シナジー条件
        </button>
        <button className={`btn btn--small${tab === 'special' ? ' btn--primary' : ''}`} onClick={() => setTab('special')}>
          🧬 特殊能力
        </button>
        <button className={`btn btn--small${tab === 'data' ? ' btn--primary' : ''}`} onClick={() => setTab('data')}>
          💾 データ管理
        </button>
      </div>

      <div className="admin-tab-body">
        {tab === 'parts' && <PartsTab />}
        {tab === 'abilities' && <SynergyTab />}
        {tab === 'special' && <SpecialAbilitiesTab />}
        {tab === 'data' && <DataToolsTab />}
      </div>
    </div>
  );
}
