import { useMemo, useRef, useState } from 'react';
import {
  buildBalanceReport,
  type BalanceReport,
} from '../../metrics/aggregate';
import { GAME_VERSION, BALANCE_VERSION } from '../../metrics/gameVersion';
import { clearAllMetrics, exportMetricsJson, loadMetricsStore, mergeImportedRuns, parseImportedRuns, saveMetricsStore } from '../../metrics/metricsStorage';
import { PARTS_BY_ID } from '../../data/parts';
import { getCommandDef } from '../../data/commandDefs';
import { getEnemyRosterEntry } from '../../data/enemyRoster';
import type { RunMetricsRecord } from '../../metrics/types';

// 開発者向けバランス確認画面(TEST12)。ブラウザ内のlocalStorageに蓄積された計測データを
// 読み取って表として表示するだけで、独自のネットワーク通信は一切行わない。
function partName(id: string): string {
  return PARTS_BY_ID[id]?.name ?? id;
}

function commandName(id: string): string {
  return getCommandDef(id)?.name ?? id;
}

function enemyName(id: string): string {
  return getEnemyRosterEntry(id)?.name ?? id;
}

function synergyLabel(label: string): string {
  const [group, key, count] = label.split(':');
  if (group === 'partType') {
    const names: Record<string, string> = { arm: '腕・触手', head: '頭・口・目', heart: '心臓・臓器', leg: '脚・翼', skin: '皮膚・外殻' };
    return `${names[key] ?? key} ×${count}`;
  }
  if (group === 'species') {
    const names: Record<string, string> = { insect: '昆虫', golem: 'ゴーレム', dragon: 'ドラゴン' };
    return `${names[key] ?? key} ×${count}`;
  }
  return label;
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

function fmtNum(v: number | null, digits = 0): string {
  return v === null ? '—' : v.toLocaleString('ja-JP', { maximumFractionDigits: digits });
}

function SampleTag({ n }: { n: number }) {
  return <span className="balance-dash__sample muted"> (n={n})</span>;
}

function WarningBanner({ report }: { report: BalanceReport }) {
  if (report.sampleWarnings.length === 0) return null;
  const CATEGORY_LABEL: Record<string, string> = { battle: '戦闘番号', enemy: '敵', part: '部位', command: 'コマンド', synergy: 'シナジー' };
  return (
    <div className="balance-dash__warning">
      ⚠️ サンプル数が少ない項目があります(参考値としてご覧ください):
      <ul>
        {report.sampleWarnings.map((w) => (
          <li key={`${w.category}:${w.key}`}>
            {CATEGORY_LABEL[w.category] ?? w.category}「{w.key}」 n={w.sampleSize}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BalanceDashboard() {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState(() => loadMetricsStore());
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => setStore(loadMetricsStore());

  const balanceVersions = useMemo(() => Array.from(new Set(store.runs.map((r) => r.balanceVersion))).sort(), [store.runs]);

  const filteredRuns: RunMetricsRecord[] = useMemo(
    () => (versionFilter === 'all' ? store.runs : store.runs.filter((r) => r.balanceVersion === versionFilter)),
    [store.runs, versionFilter]
  );

  const report = useMemo(() => buildBalanceReport(filteredRuns), [filteredRuns]);

  function handleExport() {
    const json = exportMetricsJson(store, GAME_VERSION, BALANCE_VERSION);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chimera-battle-metrics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseImportedRuns(text);
      if (!parsed.ok) {
        setImportMessage(`インポート失敗: ${parsed.reason}`);
        return;
      }
      const merged = mergeImportedRuns(loadMetricsStore(), parsed.runs);
      saveMetricsStore(merged);
      setImportMessage(`${parsed.runs.length}件のランをインポートしました`);
      refresh();
    };
    reader.onerror = () => setImportMessage('インポート失敗: ファイルを読み込めませんでした');
    reader.readAsText(file);
  }

  function handleClearAll() {
    if (!window.confirm('計測データをすべて削除します。よろしいですか？(ラン途中保存・図鑑データは影響を受けません)')) return;
    clearAllMetrics();
    refresh();
  }

  if (!open) {
    return (
      <button className="balance-dash-toggle" onClick={() => { setOpen(true); refresh(); }} title="開発者向けバランス確認画面">
        📊 バランス
      </button>
    );
  }

  return (
    <div className="balance-dash">
      <div className="balance-dash__header">
        <span>📊 バランス確認画面(開発者向け・ブラウザ内データのみ)</span>
        <div className="balance-dash__header-actions">
          <button className="btn btn--small" onClick={refresh}>
            🔄 更新
          </button>
          <button className="btn btn--small" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      </div>

      <div className="balance-dash__body">
        <div className="balance-dash__toolbar">
          <label>
            balanceVersion:
            <select value={versionFilter} onChange={(e) => setVersionFilter(e.target.value)}>
              <option value="all">すべて</option>
              {balanceVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">
            現在: gameVersion={GAME_VERSION} / balanceVersion={BALANCE_VERSION}
          </span>
          <span className="muted">
            総ラン数 {report.totalRuns} ・ 完了ラン数 {report.completedRuns}
          </span>
        </div>

        <div className="balance-dash__toolbar">
          <button className="btn btn--small" onClick={handleExport}>
            ⬇️ JSONエクスポート
          </button>
          <button className="btn btn--small" onClick={handleImportClick}>
            ⬆️ JSONインポート
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          <button className="btn btn--small btn--danger" onClick={handleClearAll}>
            🗑️ 全データ削除
          </button>
          {importMessage && <span className="muted">{importMessage}</span>}
        </div>

        <WarningBanner report={report} />

        <section className="balance-dash__section">
          <h3>戦闘番号別: 挑戦数・勝率・離脱率</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>戦闘番号</th>
                  <th>挑戦数</th>
                  <th>勝率</th>
                  <th>離脱率</th>
                </tr>
              </thead>
              <tbody>
                {report.battleStats.map((s) => (
                  <tr key={s.battleIndex}>
                    <td>第{s.battleIndex}戦</td>
                    <td>{s.challengeCount}</td>
                    <td>
                      {fmtPct(s.winRate)} ({s.winCount}勝{s.loseCount}敗)
                    </td>
                    <td>{fmtPct(s.dropoffRate)}</td>
                  </tr>
                ))}
                {report.battleStats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="balance-dash__section">
          <h3>敵別: 選択率・勝率・平均戦闘時間</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>敵</th>
                  <th>候補提示数</th>
                  <th>選択率</th>
                  <th>勝率</th>
                  <th>平均戦闘時間</th>
                </tr>
              </thead>
              <tbody>
                {report.enemyStats.map((s) => (
                  <tr key={s.enemyId}>
                    <td>{enemyName(s.enemyId)}</td>
                    <td>{s.candidateCount}</td>
                    <td>{fmtPct(s.selectionRate)}</td>
                    <td>
                      {fmtPct(s.winRate)}
                      <SampleTag n={s.wins + s.losses} />
                    </td>
                    <td>{s.avgBattleTimeSeconds !== null ? `${fmtNum(s.avgBattleTimeSeconds, 1)}秒` : '—'}</td>
                  </tr>
                ))}
                {report.enemyStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="balance-dash__section">
          <h3>部位別: 候補出現数・選択率・装着率・最終ビルド勝率</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>部位</th>
                  <th>候補出現数</th>
                  <th>選択率</th>
                  <th>装着率</th>
                  <th>最終ビルド勝率</th>
                </tr>
              </thead>
              <tbody>
                {report.partStats.map((s) => (
                  <tr key={s.partId}>
                    <td>{partName(s.partId)}</td>
                    <td>{s.candidateCount}</td>
                    <td>
                      {fmtPct(s.selectionRate)}
                      <SampleTag n={s.chosenCount} />
                    </td>
                    <td>{fmtPct(s.equipRate)}</td>
                    <td>
                      {fmtPct(s.finalBuildWinRate)}
                      <SampleTag n={s.finalBuildCount} />
                    </td>
                  </tr>
                ))}
                {report.partStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="balance-dash__section">
          <h3>コマンド別: 使用率・平均ダメージ・総回復量</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>コマンド</th>
                  <th>装備戦闘数</th>
                  <th>使用率</th>
                  <th>総使用回数</th>
                  <th>平均ダメージ/回</th>
                  <th>総回復量</th>
                </tr>
              </thead>
              <tbody>
                {report.commandStats.map((s) => (
                  <tr key={s.commandId}>
                    <td>{commandName(s.commandId)}</td>
                    <td>{s.battlesEquipped}</td>
                    <td>
                      {fmtPct(s.usageRate)}
                      <SampleTag n={s.battlesEquipped} />
                    </td>
                    <td>{s.totalUses}</td>
                    <td>{fmtNum(s.avgDamagePerUse, 1)}</td>
                    <td>{fmtNum(s.totalHeal)}</td>
                  </tr>
                ))}
                {report.commandStats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="balance-dash__section">
          <h3>シナジー別: 採用率・勝率</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>シナジー</th>
                  <th>採用ラン数</th>
                  <th>勝率</th>
                </tr>
              </thead>
              <tbody>
                {report.synergyStats.map((s) => (
                  <tr key={s.label}>
                    <td>{synergyLabel(s.label)}</td>
                    <td>{s.adoptionCount}</td>
                    <td>
                      {fmtPct(s.winRate)}
                      <SampleTag n={s.adoptionCount} />
                    </td>
                  </tr>
                ))}
                {report.synergyStats.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="balance-dash__section">
          <h3>死亡原因</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>原因</th>
                  <th>件数</th>
                  <th>割合</th>
                </tr>
              </thead>
              <tbody>
                {report.deathCauseStats.map((s) => (
                  <tr key={s.cause}>
                    <td>{s.cause}</td>
                    <td>{s.count}</td>
                    <td>{fmtPct(s.share)}</td>
                  </tr>
                ))}
                {report.deathCauseStats.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="balance-dash__section">
          <h3>balanceVersion別比較</h3>
          <div className="balance-dash__table-wrap">
            <table className="balance-dash__table">
              <thead>
                <tr>
                  <th>balanceVersion</th>
                  <th>ラン数</th>
                  <th>完了数</th>
                  <th>勝率</th>
                  <th>リセット数</th>
                  <th>平均到達戦闘</th>
                </tr>
              </thead>
              <tbody>
                {report.balanceVersionSummaries.map((s) => (
                  <tr key={s.balanceVersion}>
                    <td>{s.balanceVersion}</td>
                    <td>{s.runCount}</td>
                    <td>{s.completedRunCount}</td>
                    <td>{fmtPct(s.victoryRate)}</td>
                    <td>{s.resetCount}</td>
                    <td>{fmtNum(s.avgBattleReached, 1)}</td>
                  </tr>
                ))}
                {report.balanceVersionSummaries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
