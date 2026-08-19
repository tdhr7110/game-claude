import type { PartDef } from '../data/types';
import { resolveAllFamilies, type CommandDef } from '../data/commandDefs';

// ============================================================
// 部位獲得後に「新しく解放・進化したコマンド」を検出する処理。
// 判定そのものは data/commandDefs.ts の resolveAllFamilies() / resolveFamilyBestCommand()
// を再利用するだけで、条件判定ロジックをここで再実装しない。
// ============================================================

export interface CommandChangeEvent {
  familyId: string;
  kind: 'unlocked' | 'evolved';
  from: CommandDef | null; // 変化前に解決されていた技(新規解放ならnull)
  to: CommandDef; // 変化後に解決された技
  wasEquippedSlot: number; // 変化前、familyIdが装備されていた枠番号(未装備なら-1)
}

// beforeDefs→afterDefsの部位変化によって発生したコマンドの変化を全て返す。
// 「装着中の部位」だけを見る既存の判定(resolveAllFamilies)をbefore/afterでそれぞれ呼び、
// familyIdごとに解決結果を突き合わせるだけの純粋関数。
export function detectCommandChanges(beforeDefs: PartDef[], afterDefs: PartDef[], loadout: (string | null)[]): CommandChangeEvent[] {
  const beforeFamilies = resolveAllFamilies(beforeDefs);
  const afterFamilies = resolveAllFamilies(afterDefs);
  const beforeMap = new Map(beforeFamilies.map((f) => [f.familyId, f.command]));

  const events: CommandChangeEvent[] = [];
  for (const f of afterFamilies) {
    const prevCmd = beforeMap.get(f.familyId) ?? null;
    const newCmd = f.command;
    if (!newCmd) continue; // 解放条件を満たしていない(変化なし、または条件を失った→別処理で自動解除済み)
    if (!prevCmd) {
      events.push({ familyId: f.familyId, kind: 'unlocked', from: null, to: newCmd, wasEquippedSlot: loadout.indexOf(f.familyId) });
    } else if (prevCmd.commandId !== newCmd.commandId) {
      events.push({ familyId: f.familyId, kind: 'evolved', from: prevCmd, to: newCmd, wasEquippedSlot: loadout.indexOf(f.familyId) });
    }
  }
  return events;
}
