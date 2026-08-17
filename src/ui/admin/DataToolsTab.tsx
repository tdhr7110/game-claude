import { useState } from 'react';
import { exportStateJSON, getChangeLog, importStateJSON, resetAll } from '../../engine/adminStore';

export function DataToolsTab() {
  const [importText, setImportText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const log = getChangeLog();

  function handleExport() {
    setImportText(exportStateJSON());
    setNotice('現在の設定をJSONとして下のテキストエリアに出力しました。コピーして保存してください。');
    setError(null);
  }

  function handleImport() {
    const res = importStateJSON(importText);
    if (res.ok) {
      setNotice('JSONをインポートしました');
      setError(null);
    } else {
      setError(res.error ?? 'インポートに失敗しました');
      setNotice(null);
    }
  }

  function handleReset() {
    if (!window.confirm('すべてのテスト用変更（部位編集・新規部位・特殊能力パラメータ・シナジー調整）を初期状態へ戻します。よろしいですか？')) return;
    resetAll();
    setImportText('');
    setNotice('初期状態へリセットしました');
    setError(null);
  }

  return (
    <div className="admin-data-tab">
      <p className="muted">
        ここでの変更はブラウザのlocalStorageにのみ保存されます。正式版のソースコード（data/parts.ts等）は書き換わりません。
        調整した内容を正式版へ反映したい場合は、JSONをエクスポートしてこの内容をClaudeへ渡してください。
      </p>

      <div className="admin-data-actions">
        <button className="btn" onClick={handleExport}>
          📤 現在の設定をJSONエクスポート
        </button>
        <button className="btn" onClick={handleImport}>
          📥 テキストエリアの内容をインポート
        </button>
        <button className="btn btn--danger" onClick={handleReset}>
          ♻️ 初期状態へリセット
        </button>
      </div>

      {notice && <div className="naming-box naming-box--done">{notice}</div>}
      {error && <div className="error-banner">{error}</div>}

      <textarea
        className="admin-json-area"
        placeholder="ここにJSONを貼り付けて「インポート」、またはエクスポートして内容を確認・コピーしてください"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
      />

      <h2>変更履歴（直近{log.length}件）</h2>
      <div className="admin-changelog">
        {log.length === 0 && <p className="muted">まだ変更はありません</p>}
        {log.map((entry) => (
          <div key={entry.id} className="admin-changelog__row">
            <span className="muted">{new Date(entry.at).toLocaleTimeString()}</span> {entry.summary}
          </div>
        ))}
      </div>
    </div>
  );
}
