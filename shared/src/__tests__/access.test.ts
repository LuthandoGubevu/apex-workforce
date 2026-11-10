import { describe, it, expect } from 'vitest';
import { checkAccess, getClockDirection } from '../rules/access.js';
import vectors from '../test-vectors/access.json';

describe('checkAccess — test vectors', () => {
  for (const v of vectors) {
    it(v.description, () => {
      const result = checkAccess({
        ...v.input,
        employee: { ...v.input.employee, endDate: v.input.employee.endDate ?? undefined },
        now: new Date(v.input.now),
      });
      if (v.expected.allowed) {
        expect(result.allowed).toBe(true);
      } else {
        expect(result.allowed).toBe(false);
        expect((result as { allowed: false; reason: string }).reason).toBe(v.expected.reason);
      }
    });
  }
});

describe('getClockDirection', () => {
  it('IN station always returns IN', () => {
    expect(getClockDirection('IN', null)).toBe('IN');
    expect(getClockDirection('IN', 'IN')).toBe('IN');
    expect(getClockDirection('IN', 'OUT')).toBe('IN');
  });
  it('OUT station always returns OUT', () => {
    expect(getClockDirection('OUT', null)).toBe('OUT');
    expect(getClockDirection('OUT', 'OUT')).toBe('OUT');
  });
  it('BOTH: no prior event → IN', () => {
    expect(getClockDirection('BOTH', null)).toBe('IN');
  });
  it('BOTH: last IN → OUT', () => {
    expect(getClockDirection('BOTH', 'IN')).toBe('OUT');
  });
  it('BOTH: last OUT → IN', () => {
    expect(getClockDirection('BOTH', 'OUT')).toBe('IN');
  });
});
