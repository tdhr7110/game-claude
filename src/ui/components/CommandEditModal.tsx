import { useMemo } from 'react';
import { useGame } from '../GameContext';
import { equippedDefs } from '../../engine/run';
import { resolveAllFamilies, getCommandDef, COMMAND_CATEGORY_LABELS, COMMAND_BALANCE, type CommandDef } from '../../data/commandDefs';
import { describeCommandCondition, describeMissingRequirements, commandEffectSummary } from '../commandFormat';
import '../commandSystem.css';

interface CommandEditModalProps {
  onClose: () => void;
}

export function CommandEditModal({ onClose }: CommandEditModalProps) {
  const { state, dispatch } = useGame();
  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const families = useMemo(() => resolveAllFamilies(eqDefs), [eqDefs]);
  const loadout = state.commandLoadout;

  function slotIndexOfFamily(familyId: string): number {
    return loadout.indexOf(familyId);
  }

  function handleSlotChange(familyId: string, value: string) {
    const slotIndex = value === '' ? -1 : Number(value);
    if (slotIndex === -1) {
      // 現在このfamilyIdが入っている枠があれば空にする
      const current = slotIndexOfFamily(familyId);
      if (current >= 0) dispatch({ type: 'SET_COMMAND_SLOT', slotIndex: current, familyId: null });
      return;
    }
    dispatch({ type: 'SET_COMMAND_SLOT', slotIndex, familyId });
  }

  return (
    <div className="intro-overlay" onClick={onClose}>
      <div className="intro-card cmd-edit" onClick={(e) => e.stopPropagation()}>
        <div className="intro-card__title">⚡ コマンド編集</div>
        <p className="muted cmd-edit__hint">
          最大{COMMAND_BALANCE.maxCommandSlots}個まで装備できます。装着中の部位によって使える技（進化形）が自動的に決まります。
        </p>

        <div className="cmd-edit__slots">
          {loadout.map((familyId, i) => {
            const cmd = familyId ? families.find((f) => f.familyId === familyId)?.command ?? null : null;
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
        <div className="cmd-edit__list">
          {families.map(({ familyId, command, allTiers }) => (
            <CommandFamilyRow
              key={familyId}
              familyId={familyId}
              command={command}
              allTiers={allTiers}
              eqDefs={eqDefs}
              slotIndex={slotIndexOfFamily(familyId)}
              onSlotChange={(v) => handleSlotChange(familyId, v)}
            />
          ))}
        </div>

        <button className="btn btn--primary btn--large" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

function CommandFamilyRow({
  command,
  allTiers,
  eqDefs,
  slotIndex,
  onSlotChange,
}: {
  familyId: string;
  command: CommandDef | null;
  allTiers: CommandDef[];
  eqDefs: ReturnType<typeof equippedDefs>;
  slotIndex: number;
  onSlotChange: (value: string) => void;
}) {
  const lowestTier = allTiers[0];
  const evolvedFromDef = command?.evolvedFrom ? getCommandDef(command.evolvedFrom) : null;

  return (
    <div className={`cmd-row${command ? '' : ' cmd-row--locked'}`}>
      <div className="cmd-row__header">
        <div className="cmd-row__name" style={{ color: command ? command.color : undefined }}>
          {command ? `${command.icon} ${command.name}` : `🔒 ${lowestTier.name}系`}
        </div>
        <select className="cmd-row__slot-select" value={slotIndex >= 0 ? String(slotIndex) : ''} onChange={(e) => onSlotChange(e.target.value)} disabled={!command}>
          <option value="">未装備</option>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              枠{i + 1}へ装備
            </option>
          ))}
        </select>
      </div>

      {command ? (
        <>
          <div className="cmd-row__desc">{command.description}</div>
          <div className="cmd-row__stats">
            <span>💧代謝{command.metabolismCost}</span>
            <span>⏱CD{command.cooldownSeconds}秒</span>
            <span>{commandEffectSummary(command)}</span>
          </div>
          {evolvedFromDef && (
            <div className="cmd-row__evolution">
              進化元: {evolvedFromDef.icon}
              {evolvedFromDef.name} → {command.icon}
              {command.name}
            </div>
          )}
        </>
      ) : (
        <div className="cmd-row__missing">
          解放条件: {describeCommandCondition(lowestTier)}
          <br />
          足りない部位: {describeMissingRequirements(lowestTier, eqDefs).join('、') || 'なし'}
        </div>
      )}

      {allTiers.length > 1 && (
        <div className="cmd-row__tiers">
          {allTiers.map((tier) => (
            <span key={tier.commandId} className={`cmd-row__tier-chip${command?.commandId === tier.commandId ? ' cmd-row__tier-chip--active' : ''}`}>
              {tier.icon}
              {tier.name}
              {command?.commandId !== tier.commandId ? `（条件: ${describeCommandCondition(tier)}）` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
