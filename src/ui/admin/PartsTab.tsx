import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import {
  applyPartPatch,
  createCustomPart,
  deleteCustomPart,
  duplicatePart,
  getAllParts,
  getBasePartDef,
  hasPatch,
  isCustomPart,
  setPartEnabled,
} from '../../engine/adminStore';
import { getEffectSchema, EFFECT_KIND_SCHEMAS } from '../../data/effectSchemas';
import type { PartDef, PartEffect, PartType, Rarity, Species } from '../../data/types';
import { rarityLabel, speciesLabel, typeLabel } from '../format';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare'];
const SPECIES_LIST: Species[] = ['insect', 'golem', 'dragon', 'none'];
const TYPES: PartType[] = ['arm', 'head', 'heart', 'leg', 'skin'];

function blankDraft(): PartDef {
  return {
    id: '',
    name: '新規部位',
    type: 'arm',
    species: 'none',
    rarity: 'common',
    cost: 1,
    hpBonus: 0,
    attack: 3,
    interval: 1.0,
    description: '',
    tags: [],
    icon: '❓',
    color: '#a855f7',
    effects: [],
    dropWeight: 1,
    enabled: true,
  };
}

export function PartsTab() {
  const { dispatch } = useGame();
  const parts = getAllParts();

  const [nameQuery, setNameQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<Rarity | ''>('');
  const [speciesFilter, setSpeciesFilter] = useState<Species | ''>('');
  const [typeFilter, setTypeFilter] = useState<PartType | ''>('');
  const [enabledFilter, setEnabledFilter] = useState<'' | 'enabled' | 'disabled'>('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartDef | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return parts.filter((p) => {
      if (nameQuery && !p.name.toLowerCase().includes(nameQuery.toLowerCase()) && !p.id.includes(nameQuery.toLowerCase())) return false;
      if (rarityFilter && p.rarity !== rarityFilter) return false;
      if (speciesFilter && p.species !== speciesFilter) return false;
      if (typeFilter && p.type !== typeFilter) return false;
      if (enabledFilter === 'enabled' && p.enabled === false) return false;
      if (enabledFilter === 'disabled' && p.enabled !== false) return false;
      return true;
    });
  }, [parts, nameQuery, rarityFilter, speciesFilter, typeFilter, enabledFilter]);

  function selectPart(id: string) {
    const p = parts.find((x) => x.id === id);
    if (!p) return;
    setSelectedId(id);
    setIsCreating(false);
    setDraft({ ...p, effects: p.effects.map((e) => ({ ...e })), tags: [...p.tags] });
    setError(null);
    setNotice(null);
  }

  function startCreate() {
    setSelectedId(null);
    setIsCreating(true);
    setDraft(blankDraft());
    setError(null);
    setNotice(null);
  }

  function handleDuplicate(id: string) {
    const source = parts.find((p) => p.id === id);
    if (!source) return;
    const newId = `${source.id}_copy_${Date.now().toString(36)}`;
    const res = duplicatePart(id, newId, `${source.name}（複製）`);
    if (res.ok) {
      setNotice(`「${source.name}」を複製しました（ID: ${newId}）`);
      selectPart(newId);
    } else {
      setError(res.error ?? '複製に失敗しました');
    }
  }

  function handleSave() {
    if (!draft) return;
    setError(null);
    if (isCreating) {
      const res = createCustomPart(draft);
      if (res.ok) {
        setNotice(`新規部位「${draft.name}」を作成しました`);
        setIsCreating(false);
        selectPart(draft.id);
      } else {
        setError(res.error ?? '作成に失敗しました');
      }
    } else if (selectedId) {
      const res = applyPartPatch(selectedId, draft);
      if (res.ok) setNotice('保存しました');
      else setError(res.error ?? '保存に失敗しました');
    }
  }

  function handleTestGrant(id: string) {
    dispatch({ type: 'DEBUG_GRANT_PART', defId: id });
    setNotice('インベントリへ付与しました（ゲーム画面の戦闘準備 → インベントリから装着できます）');
  }

  function addEffect(kind: PartEffect['kind']) {
    if (!draft) return;
    const schema = getEffectSchema(kind);
    if (!schema) return;
    const newEffect: Record<string, unknown> = { kind };
    for (const f of schema.fields) newEffect[f.key] = f.type === 'partType' ? 'arm' : 0;
    setDraft({ ...draft, effects: [...draft.effects, newEffect as PartEffect] });
  }

  function removeEffect(index: number) {
    if (!draft) return;
    setDraft({ ...draft, effects: draft.effects.filter((_, i) => i !== index) });
  }

  function updateEffectField(index: number, field: string, value: string | number) {
    if (!draft) return;
    const effects = draft.effects.map((e, i) => (i === index ? { ...e, [field]: value } : e));
    setDraft({ ...draft, effects: effects as PartEffect[] });
  }

  const baseForDiff = selectedId ? getBasePartDef(selectedId) : null;

  return (
    <div className="admin-parts-tab">
      <div className="admin-filters">
        <input placeholder="名前・IDで検索" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} />
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as Rarity | '')}>
          <option value="">レアリティ: すべて</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {rarityLabel(r)}
            </option>
          ))}
        </select>
        <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value as Species | '')}>
          <option value="">種族: すべて</option>
          {SPECIES_LIST.map((s) => (
            <option key={s} value={s}>
              {speciesLabel(s)}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PartType | '')}>
          <option value="">カテゴリ: すべて</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
        <select value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value as '' | 'enabled' | 'disabled')}>
          <option value="">有効/無効: すべて</option>
          <option value="enabled">有効のみ</option>
          <option value="disabled">無効のみ</option>
        </select>
        <button className="btn btn--small btn--primary" onClick={startCreate}>
          ➕ 新規部位作成
        </button>
      </div>

      <div className="admin-parts-layout">
        <div className="admin-parts-list">
          {filtered.map((p) => (
            <button key={p.id} className={`admin-part-row${selectedId === p.id ? ' admin-part-row--selected' : ''}`} onClick={() => selectPart(p.id)}>
              <span>{p.icon}</span>
              <span className="admin-part-row__name">
                {p.name}
                {p.enabled === false && <span className="muted"> (無効)</span>}
                {hasPatch(p.id) && <span className="chip">変更あり</span>}
                {isCustomPart(p.id) && <span className="chip">新規</span>}
              </span>
              <span className="muted">{rarityLabel(p.rarity)} / {typeLabel(p.type)}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="muted">該当する部位がありません</p>}
        </div>

        {draft && (
          <div className="admin-part-form">
            {error && <div className="error-banner">{error}</div>}
            {notice && <div className="naming-box naming-box--done">{notice}</div>}

            {isCreating && (
              <label className="admin-field">
                ID（英小文字・数字・_のみ）
                <input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
              </label>
            )}

            <label className="admin-field">
              名前
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>

            <div className="admin-field-grid">
              <label className="admin-field">
                レアリティ
                <select value={draft.rarity} onChange={(e) => setDraft({ ...draft, rarity: e.target.value as Rarity })}>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {rarityLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                種族
                <select value={draft.species} onChange={(e) => setDraft({ ...draft, species: e.target.value as Species })}>
                  {SPECIES_LIST.map((s) => (
                    <option key={s} value={s}>
                      {speciesLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                カテゴリ（部位種類）
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as PartType })}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                接続コスト
                <input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} />
              </label>
              <label className="admin-field">
                攻撃力
                <input type="number" value={draft.attack} onChange={(e) => setDraft({ ...draft, attack: Number(e.target.value) })} />
              </label>
              <label className="admin-field">
                攻撃間隔(秒)
                <input type="number" step={0.1} value={draft.interval} onChange={(e) => setDraft({ ...draft, interval: Number(e.target.value) })} />
              </label>
              <label className="admin-field">
                HP補正
                <input type="number" value={draft.hpBonus} onChange={(e) => setDraft({ ...draft, hpBonus: Number(e.target.value) })} />
              </label>
              <label className="admin-field">
                ドロップ重み
                <input type="number" min={0.1} step={0.1} value={draft.dropWeight ?? 1} onChange={(e) => setDraft({ ...draft, dropWeight: Number(e.target.value) })} />
              </label>
              <label className="admin-field">
                アイコン(絵文字)
                <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
              </label>
            </div>

            {baseForDiff && (
              <DiffRow base={baseForDiff} current={draft} />
            )}

            <label className="admin-field">
              説明
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </label>

            <label className="admin-field admin-field--checkbox">
              <input type="checkbox" checked={draft.enabled !== false} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              有効（ドロップ候補に出現する）
            </label>

            <div className="admin-effects-editor">
              <div className="muted">通常能力（Effect）</div>
              {draft.effects.map((e, i) => {
                const schema = getEffectSchema(e.kind);
                return (
                  <div key={i} className="admin-effect-row">
                    {schema ? (
                      <>
                        <span className="chip">{schema.label}</span>
                        <span className="muted">[{schema.trigger}]</span>
                        {schema.fields.map((f) => (
                          <label key={f.key} className="admin-effect-field">
                            {f.label}
                            {f.type === 'partType' ? (
                              <select
                                value={String((e as unknown as Record<string, unknown>)[f.key] ?? 'arm')}
                                onChange={(ev) => updateEffectField(i, f.key, ev.target.value)}
                              >
                                {TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {typeLabel(t)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                step={f.step ?? (f.type === 'percent' ? 0.01 : 1)}
                                value={Number((e as unknown as Record<string, unknown>)[f.key] ?? 0)}
                                onChange={(ev) => updateEffectField(i, f.key, Number(ev.target.value))}
                              />
                            )}
                          </label>
                        ))}
                      </>
                    ) : (
                      <span className="muted">
                        {e.kind}（この種類はUIから直接編集できません。データ管理タブのJSONエクスポートから編集してください）
                      </span>
                    )}
                    <button className="btn btn--small btn--danger" onClick={() => removeEffect(i)}>
                      削除
                    </button>
                  </div>
                );
              })}
              <div className="admin-effect-add">
                <select id="add-effect-kind" defaultValue="">
                  <option value="" disabled>
                    効果を追加...
                  </option>
                  {EFFECT_KIND_SCHEMAS.map((s) => (
                    <option key={s.kind} value={s.kind}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--small"
                  onClick={() => {
                    const el = document.getElementById('add-effect-kind') as HTMLSelectElement | null;
                    if (el && el.value) {
                      addEffect(el.value as PartEffect['kind']);
                      el.value = '';
                    }
                  }}
                >
                  追加
                </button>
              </div>
            </div>

            <div className="admin-part-actions">
              <button className="btn btn--primary" onClick={handleSave}>
                💾 保存
              </button>
              {!isCreating && selectedId && (
                <>
                  <button className="btn" onClick={() => handleDuplicate(selectedId)}>
                    📋 複製して編集
                  </button>
                  <button className="btn" onClick={() => handleTestGrant(selectedId)}>
                    🧪 この部位を取得（テスト用）
                  </button>
                  <button className="btn btn--danger" onClick={() => setPartEnabled(selectedId, draft.enabled === false)}>
                    {draft.enabled === false ? '有効化する' : '無効化する'}
                  </button>
                  {isCustomPart(selectedId) && (
                    <button
                      className="btn btn--danger"
                      onClick={() => {
                        const res = deleteCustomPart(selectedId);
                        if (res.ok) {
                          setSelectedId(null);
                          setDraft(null);
                        } else {
                          setError(res.error ?? '削除に失敗しました');
                        }
                      }}
                    >
                      🗑 削除（新規作成部位のみ）
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffRow({ base, current }: { base: PartDef; current: PartDef }) {
  const fields: { key: keyof PartDef; label: string }[] = [
    { key: 'cost', label: '接続コスト' },
    { key: 'attack', label: '攻撃力' },
    { key: 'interval', label: '攻撃間隔' },
    { key: 'hpBonus', label: 'HP補正' },
    { key: 'rarity', label: 'レアリティ' },
  ];
  const changed = fields.filter((f) => base[f.key] !== current[f.key]);
  if (changed.length === 0) return null;
  return (
    <div className="admin-diff">
      <div className="muted">元の値との差分:</div>
      {changed.map((f) => (
        <div key={f.key} className="admin-diff-row">
          {f.label}: <span className="admin-diff-before">{String(base[f.key])}</span> →{' '}
          <span className="admin-diff-after">{String(current[f.key])}</span>
        </div>
      ))}
    </div>
  );
}
