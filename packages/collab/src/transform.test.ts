import { describe, expect, it } from 'vitest';
import { applyOp } from './apply';
import { transform } from './transform';
import type { InsertTextOp, Op, RemoveTextOp, SlateDescendant } from './types';

const PATH = [0, 0] as const;
const CLIENT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const CLIENT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function ins(offset: number, text: string): InsertTextOp {
  return { type: 'insert_text', path: PATH, offset, text };
}

function rem(offset: number, text: string): RemoveTextOp {
  return { type: 'remove_text', path: PATH, offset, text };
}

// Helper: apply an Op to a plain string (extracts from single-paragraph content)
function mkContent(text: string): SlateDescendant[] {
  return [{ type: 'paragraph', children: [{ text }] }];
}

function applyStr(text: string, op: Op | null): string {
  if (op === null) return text;
  const result = applyOp(mkContent(text), op);
  const block = result[0] as { children: Array<{ text: string }> };
  return block.children[0]?.text ?? '';
}

// TP1 convergence property: apply(apply(S, O1), T(O2, O1)) === apply(apply(S, O2), T(O1, O2))
function converges(s: string, o1: Op, o2: Op): boolean {
  const t_o2_o1 = transform(o2, o1, CLIENT_B, CLIENT_A);
  const t_o1_o2 = transform(o1, o2, CLIENT_A, CLIENT_B);

  const path1 = applyStr(applyStr(s, o1), t_o2_o1);
  const path2 = applyStr(applyStr(s, o2), t_o1_o2);

  return path1 === path2;
}

// ────────────────────────────────────────────────────────────
// insert × insert
// ────────────────────────────────────────────────────────────
describe('transform: insert × insert', () => {
  it('server before client — client shifts right', () => {
    const client = ins(5, 'X');
    const server = ins(2, 'AB');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(ins(7, 'X'));
  });

  it('server after client — client unchanged', () => {
    const client = ins(2, 'X');
    const server = ins(5, 'AB');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(client);
  });

  it('same offset, server id < client id — server wins, client shifts', () => {
    // CLIENT_A < CLIENT_B, so when server=CLIENT_A and client=CLIENT_B, server wins
    const client = ins(3, 'X');
    const server = ins(3, 'Y');
    const result = transform(client, server, CLIENT_B, CLIENT_A); // clientId=B, serverId=A
    expect(result).toEqual(ins(4, 'X')); // A < B so server A wins, client shifts
  });

  it('same offset, client id < server id — client wins, stays', () => {
    const client = ins(3, 'X');
    const server = ins(3, 'Y');
    const result = transform(client, server, CLIENT_A, CLIENT_B); // clientId=A, serverId=B
    expect(result).toEqual(client); // A < B so client A wins, stays put
  });

  it('convergence: same offset', () => {
    expect(converges('hello', ins(2, 'X'), ins(2, 'Y'))).toBe(true);
  });

  it('convergence: client before server', () => {
    expect(converges('hello', ins(1, 'A'), ins(4, 'B'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// remove × remove
// ────────────────────────────────────────────────────────────
describe('transform: remove × remove', () => {
  it('server entirely before client — client shifts left', () => {
    const client = rem(5, 'XY');
    const server = rem(1, 'AB');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(rem(3, 'XY'));
  });

  it('server entirely after client — client unchanged', () => {
    const client = rem(1, 'AB');
    const server = rem(5, 'XY');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(client);
  });

  it('server overlaps start of client — trims client prefix', () => {
    // "ABCDE": client removes "CDE" (2-4), server removes "BC" (1-2)
    const client = rem(2, 'CDE');
    const server = rem(1, 'BC');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    // server removed [1,3), client range [2,5). Overlap [2,3). Client keeps [3,5) = "DE"
    // In new string "ADE...", remove "DE" starting at position 1 (min(2,1)=1)
    expect(result).toEqual(rem(1, 'DE'));
  });

  it('server overlaps end of client — trims client suffix', () => {
    // "ABCDE": client removes "ABC" (0-2), server removes "CDE" (2-4)
    const client = rem(0, 'ABC');
    const server = rem(2, 'CDE');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    // server removed [2,5), client range [0,3). Overlap [2,3). Client keeps [0,2) = "AB"
    // In new string "AB", remove "AB" at 0
    expect(result).toEqual(rem(0, 'AB'));
  });

  it('identical deletions — returns null (no-op)', () => {
    const client = rem(2, 'BCD');
    const server = rem(2, 'BCD');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toBeNull();
  });

  it('server deletion fully contains client — returns null', () => {
    const client = rem(2, 'B');
    const server = rem(1, 'ABCD');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toBeNull();
  });

  it('convergence: non-overlapping', () => {
    expect(converges('hello world', rem(0, 'he'), rem(9, 'ld'))).toBe(true);
  });

  it('convergence: overlapping', () => {
    expect(converges('abcdef', rem(1, 'bcd'), rem(3, 'def'))).toBe(true);
  });

  it('convergence: identical', () => {
    expect(converges('abcde', rem(1, 'bc'), rem(1, 'bc'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// insert × remove
// ────────────────────────────────────────────────────────────
describe('transform: insert × remove', () => {
  it('server delete entirely before insert — shifts insert left', () => {
    const client = ins(5, 'X');
    const server = rem(1, 'AB');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(ins(3, 'X'));
  });

  it('server delete at/after insert — no change', () => {
    const client = ins(2, 'X');
    const server = rem(3, 'AB');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(client);
  });

  it('insert inside deleted range — becomes null (context no longer exists)', () => {
    // "ABCDE": client inserts at 3, server removes "BCD" (1-3)
    // Insert context is gone; returning null satisfies TP1 (dual expands the deletion)
    const client = ins(3, 'X');
    const server = rem(1, 'BCD');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toBeNull();
  });

  it('convergence: insert before delete', () => {
    expect(converges('hello', ins(0, 'X'), rem(1, 'el'))).toBe(true);
  });

  it('convergence: insert inside delete range', () => {
    expect(converges('hello', ins(2, 'X'), rem(1, 'ell'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// remove × insert
// ────────────────────────────────────────────────────────────
describe('transform: remove × insert', () => {
  it('server insert before remove — shifts remove right', () => {
    const client = rem(3, 'CD');
    const server = ins(1, 'XY');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(rem(5, 'CD'));
  });

  it('server insert after remove — no change', () => {
    const client = rem(1, 'BC');
    const server = ins(5, 'X');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    expect(result).toEqual(client);
  });

  it('server insert inside remove range — expands deletion', () => {
    // "ABCDE": client removes "BCD" (1-3), server inserts "X" at 2
    const client = rem(1, 'BCD');
    const server = ins(2, 'X');
    const result = transform(client, server, CLIENT_A, CLIENT_B);
    // After server insert: "ABXCDE". Client must remove "BXCD" starting at 1
    expect(result).toEqual(rem(1, 'BXCD'));
  });

  it('convergence: remove then insert inside', () => {
    expect(converges('abcdef', rem(1, 'bcd'), ins(2, 'X'))).toBe(true);
  });

  it('convergence: remove then insert before', () => {
    expect(converges('hello', rem(2, 'll'), ins(0, 'XX'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// Parametrized convergence over many op pairs (≥50)
// ────────────────────────────────────────────────────────────
describe('TP1 convergence property — parametrized', () => {
  const strings = ['', 'a', 'ab', 'hello', 'hello world', 'abcdefghij'];

  function genOps(s: string): Op[] {
    const ops: Op[] = [];
    const n = s.length;
    if (n === 0) {
      ops.push(ins(0, 'x'));
      return ops;
    }
    // insert at each position
    for (let i = 0; i <= Math.min(n, 3); i++) {
      ops.push(ins(i, 'X'));
      ops.push(ins(i, 'YZ'));
    }
    // remove single chars
    for (let i = 0; i < Math.min(n, 4); i++) {
      ops.push(rem(i, s[i] ?? ''));
    }
    // remove pairs
    if (n >= 2) {
      for (let i = 0; i < Math.min(n - 1, 3); i++) {
        ops.push(rem(i, s.slice(i, i + 2)));
      }
    }
    return ops;
  }

  let testCount = 0;

  for (const s of strings) {
    const ops = genOps(s);
    for (const o1 of ops) {
      for (const o2 of ops) {
        testCount++;
        it(`[${testCount}] converges: "${s}" o1=${o1.type}@${o1.offset} o2=${o2.type}@${o2.offset}`, () => {
          expect(converges(s, o1, o2)).toBe(true);
        });
      }
    }
  }
});
