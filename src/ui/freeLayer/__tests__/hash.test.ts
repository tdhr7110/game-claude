import { describe, expect, it } from 'vitest';
import { hashString, seededRange, seededUnit } from '../hash';

describe('hash', () => {
  it('hashStringは同じ入力に対して常に同じ値を返す(決定論的)', () => {
    expect(hashString('arm-000')).toBe(hashString('arm-000'));
    expect(hashString('insect_sickle_arm')).toBe(hashString('insect_sickle_arm'));
  });

  it('hashStringは異なる入力に対して基本的に異なる値を返す', () => {
    const values = new Set(['a', 'b', 'c', 'arm-000', 'arm-001', 'leg-000'].map(hashString));
    expect(values.size).toBe(6);
  });

  it('seededUnitは常に[0,1)の範囲を返す', () => {
    for (const seed of ['arm-000', 'arm-001', 'leg-042', '']) {
      const v = seededUnit(seed, 'test');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('saltを変えると独立した系列になる(同じseedでも値が変わる)', () => {
    const a = seededUnit('same-seed', 'salt-a');
    const b = seededUnit('same-seed', 'salt-b');
    expect(a).not.toBe(b);
  });

  it('seededRangeは指定した[min,max)範囲に収まる', () => {
    for (let i = 0; i < 50; i++) {
      const v = seededRange(`item-${i}`, 'rotation', -6, 6);
      expect(v).toBeGreaterThanOrEqual(-6);
      expect(v).toBeLessThan(6);
    }
  });

  it('同じseed+saltなら再計算しても常に同じ値(装着順が変わっても個体の見た目が変わらないための前提)', () => {
    const v1 = seededRange('instance-42', 'brightness', 0.88, 1.08);
    const v2 = seededRange('instance-42', 'brightness', 0.88, 1.08);
    expect(v1).toBe(v2);
  });
});
