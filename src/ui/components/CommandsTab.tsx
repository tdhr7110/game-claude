import { useMemo } from 'react';
import { useGame } from '../GameContext';
import { equippedDefs } from '../../engine/run';
import { resolveAllFamilies, getCommandDef, COMMAND_CATEGORY_LABELS, COMMAND_BALANCE, type CommandDef } from '../../data/commandDefs';
import { commandEffectSummaryShort } from '../commandFormat';
import '../commandSystem.css';

// TEST18: 従来は別ポップアップ(CommandEditModal)だったコマンド編集を、戦闘準備画面の
// 通常タブ(ステータス/部位/シナジーと同列)として表示するように変更したもの。
// あわせて、未解放(装着部位の条件を満たさない)コマンドは一覧から非表示にする
// (「一度取得したコマンドを後から自由に変更できるか」の仕様自体は今回変更しない)。
export function CommandsTab() {
  const { state, dispatch } = useGame();
  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const families = useMemo(() => resolveAllFamilies(eqDefs), [eqDefs]);
  const unlockedFamilies = useMemo(() => families.filter((f) => f.command !== null), [families]);
  const loadout = state.commandLoadout;

  function slotIndexOfFamily(familyId: string): number {
    return loadout.indexOf(familyId);
  }

  function handleSlotChange(familyId: string, value: string) {
    const slotIndex = value === '' ? -1 : Number(value);
    if (slotIndex === -1) {
      const current = slotIndexOfFamily(familyId);
      if (current >= 0) dispatch({ type: 'SET_COMMAND_SLOT', slotIndex: current, familyId: null });
      return;
    }
    dispatch({ type: 'SET_COMMAND_SLOT', slotIndex, familyId });
  }

  return (
    <div className="cmd-edit cmd-edit--tab">
      <p className="muted cmd-edit__hint">
        最大{COMMAND_BALANCE.maxCommandSlots}個まで装備できます。装着中の部位によって使える技（進化形）が自動的に決まります。
      </p>

      <div className="cmd-edit__slots">
        {loadout.map((familyId, i) => {
          const cmd = familyId ? unlockedFamilies.find((f) => f.familyId === familyId)?.command ?? null : null;
          return (
            <div key={i} className="cmd-slot-card">
              <div className="cmd-slot-card__label">枠{i + 1}</div>
              {cmd ? (
                <>
                  <div className="cmd-slot-card__name" style={{ color: cmd.color }}>
                    {cmd.icon} {cmd.name}
                  </div>
                  <div className="muted cmd-slot-card__cat">{COMMAND_CATEGORY_LABELS[cmd.category]}</div>
                  <button className="btn btn--small" onClick={() => dispatch({ type: 'SET_COMMAND_SLOT', slotIndex: i, familyId: null })}>
                    外す
                  </button>
                </>
              ) : (
                <div className="muted cmd-slot-card__empty">空き</div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="cmd-edit__section-title">使用可能なコマンド一覧</h2>
      {unlockedFamilies.length === 0 && <p className="muted">まだ使用できるコマンドがありません。部位を装着すると解放されます。</p>}
      <div className="cmd-edit__list">
        {unlockedFamilies.map(({ familyId, command }) => (
          <CommandFamilyRow
            key={familyId}
            command={command}
            slotIndex={slotIndexOfFamily(familyId)}
            onSlotChange={(v) => handleSlotChange(familyId, v)}
          />
        ))}
      </div>
    </div>
  );
}

function CommandFamilyRow({
  command,
  slotIndex,
  onSlotChange,
}: {
  command: CommandDef | null;
  slotIndex: number;
  onSlotChange: (value: string) => void;
}) {
  // このコンポーネントはunlockedFamilies経由でのみ呼ばれるため、commandは常に非nullだが、
  // 型上はnullableのまま安全に扱う。
  if (!command) return null;
  const evolvedFromCmd = command.evolvedFrom ? getCommandDef(command.evolvedFrom) : null;

  return (
    <div className="cmd-row">
      <div className="cmd-row__header">
        <div className="cmd-row__name" style={{ color: command.color }}>
          {command.icon} {command.name}
        </div>
        <select className="cmd-row__slot-select" value={slotIndex >= 0 ? String(slotIndex) : ''} onChange={(e) => onSlotChange(e.target.value)}>
          <option value="">未装備</option>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              枠{i + 1}へ装備
            </option>
          ))}
        </select>
      </div>

      <div className="cmd-row__desc">{commandEffectSummaryShort(command)}</div>
      <div className="cmd-row__stats">
        <span>💧代謝{command.metabolismCost}</span>
        <span>⏱CD{command.cooldownSeconds}秒</span>
      </div>
      {evolvedFromCmd && (
        <div className="cmd-row__evolution">
          進化元: {evolvedFromCmd.icon}
          {evolvedFromCmd.name} → {command.icon}
          {command.name}
        </div>
      )}
    </div>
  );
}
