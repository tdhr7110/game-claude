import { describe, expect, it } from 'vitest';
import { ALL_PARTS } from './parts';
import { ENEMY_CATALOG } from './enemyCatalog';
import { commandsRequiringPart, enemyCollectionRates, partCollectionRates } from './collectionCategories';

describe('partCollectionRates', () => {
  it('未発見(空集合)なら全カテゴリのdiscoveredが0で合計totalが部位総数と一致する', () => {
    const rates = partCollectionRates(new Set());
    expect(rates.reduce((a, r) => a + r.total, 0)).toBe(ALL_PARTS.length);
    expect(rates.every((r) => r.discovered === 0 && r.pct === 0)).toBe(true);
  });

  it('全部位を発見済みにするとpctが100になる', () => {
    const rates = partCollectionRates(new Set(ALL_PARTS.map((p) => p.id)));
    expect(rates.every((r) => r.discovered === r.total && r.pct === 100)).toBe(true);
  });

  it('特定の1部位だけ発見済みならそのカテゴリのdiscoveredだけ1になる', () => {
    const def = ALL_PARTS[0];
    const rates = partCollectionRates(new Set([def.id]));
    const cat = rates.find((r) => r.category === def.species)!;
    expect(cat.discovered).toBe(1);
  });
});

describe('enemyCollectionRates', () => {
  it('合計totalが敵カタログの総数と一致する', () => {
    const rates = enemyCollectionRates(new Set());
    expect(rates.reduce((a, r) => a + r.total, 0)).toBe(ENEMY_CATALOG.length);
  });
});

describe('commandsRequiringPart', () => {
  it('requiredPartIdsにその部位を含むコマンドを返す', () => {
    const cmds = commandsRequiringPart('special_thousand_bones');
    expect(cmds.some((c) => c.commandId === 'cmd_bone_spear')).toBe(true);
  });

  it('同じ部位を条件に持つ複数のコマンド(進化元・進化後)をまとめて返す', () => {
    const cmds = commandsRequiringPart('insect_poison_gland');
    expect(cmds.some((c) => c.commandId === 'cmd_poison_burst')).toBe(true);
    expect(cmds.some((c) => c.commandId === 'cmd_plague_burst')).toBe(true);
  });

  it('関係の無い部位は空配列を返す', () => {
    expect(commandsRequiringPart('nonexistent_part_id')).toEqual([]);
  });
});
