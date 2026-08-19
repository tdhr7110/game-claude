import { describe, expect, it } from 'vitest';
import { CATEGORY_DRAW_GROUP, DRAW_GROUP_ORDER, DRAW_GROUP_Z_BASE, drawGroupOf } from '../drawOrder';

describe('drawOrder', () => {
  it('描画順は「後方→胴体→側面→前方→装飾」の5グループ', () => {
    expect(DRAW_GROUP_ORDER).toEqual(['back', 'torso', 'side', 'front', 'decoration']);
  });

  it('各グループのzIndex帯は描画順どおりに単調増加する', () => {
    const bases = DRAW_GROUP_ORDER.map((g) => DRAW_GROUP_Z_BASE[g]);
    for (let i = 1; i < bases.length; i++) {
      expect(bases[i]).toBeGreaterThan(bases[i - 1]);
    }
  });

  it('主要カテゴリが想定どおりのグループに属する', () => {
    expect(drawGroupOf('wing')).toBe('back');
    expect(drawGroupOf('tail')).toBe('back');
    expect(drawGroupOf('base')).toBe('torso');
    expect(drawGroupOf('leg')).toBe('side');
    expect(drawGroupOf('arm')).toBe('front');
    expect(drawGroupOf('horn')).toBe('front');
    expect(drawGroupOf('armor')).toBe('decoration');
    expect(drawGroupOf('organ')).toBe('decoration');
  });

  it('未知のカテゴリはdecoration(装飾)グループへフォールバックする(部位を消さないため)', () => {
    expect(drawGroupOf('some-unregistered-category')).toBe('decoration');
  });

  it('CATEGORY_DRAW_GROUPに載っている全カテゴリがDRAW_GROUP_ORDERの値のみを使う', () => {
    for (const group of Object.values(CATEGORY_DRAW_GROUP)) {
      expect(DRAW_GROUP_ORDER).toContain(group);
    }
  });
});
