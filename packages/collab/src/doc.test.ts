import { describe, expect, it } from 'vitest';
import { Doc } from './doc';
import { transform } from './transform';
import type { Op, ServerBroadcast, SlateDescendant } from './types';

const CLIENT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const CLIENT_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const PATH = [0, 0] as const;

function mkDoc(text: string, rev: number, clientId: string): Doc {
  const content: SlateDescendant[] = [{ type: 'paragraph', children: [{ text }] }];
  return new Doc(content as never, rev, clientId);
}

function getText(doc: Doc): string {
  const block = doc.value[0] as { children: Array<{ text: string }> };
  return block.children[0]?.text ?? '';
}

function ins(offset: number, text: string): Op {
  return { type: 'insert_text', path: PATH, offset, text };
}

function rem(offset: number, text: string): Op {
  return { type: 'remove_text', path: PATH, offset, text };
}

function broadcast(serverRev: number, clientId: string, op: Op): ServerBroadcast {
  return { serverRev, clientId, op };
}

// ────────────────────────────────────────────────────────────
// Single-peer lifecycle
// ────────────────────────────────────────────────────────────
describe('Doc: single-peer lifecycle', () => {
  it('applyLocal mutates content immediately', () => {
    const doc = mkDoc('hello', 0, CLIENT_A);
    doc.applyLocal(ins(5, ' world'));
    expect(getText(doc)).toBe('hello world');
  });

  it('applyLocal returns PendingOp with current serverRev', () => {
    const doc = mkDoc('hello', 3, CLIENT_A);
    const pending = doc.applyLocal(ins(0, 'X'));
    expect(pending.clientRev).toBe(3);
    expect(pending.op).toEqual(ins(0, 'X'));
  });

  it('ack advances serverRev and pops pending queue', () => {
    const doc = mkDoc('hello', 0, CLIENT_A);
    doc.applyLocal(ins(0, 'A'));
    expect(doc.revision).toBe(0);
    doc.ack(1);
    expect(doc.revision).toBe(1);
  });

  it('ackNoOp does not advance serverRev', () => {
    const doc = mkDoc('hello', 2, CLIENT_A);
    doc.applyLocal(rem(0, 'h'));
    doc.ackNoOp(2);
    expect(doc.revision).toBe(2);
  });

  it('multiple local ops queue in order', () => {
    const doc = mkDoc('abc', 0, CLIENT_A);
    doc.applyLocal(ins(3, 'D'));
    doc.applyLocal(ins(4, 'E'));
    expect(getText(doc)).toBe('abcDE');
  });

  it('ack throws when pending queue is empty', () => {
    const doc = mkDoc('hello', 0, CLIENT_A);
    expect(() => doc.ack(1)).toThrow();
  });

  it('ackNoOp throws when pending queue is empty', () => {
    const doc = mkDoc('hello', 0, CLIENT_A);
    expect(() => doc.ackNoOp(0)).toThrow();
  });

  it('receiveRemote throws on out-of-order serverRev', () => {
    const doc = mkDoc('hello', 0, CLIENT_A);
    expect(() => doc.receiveRemote(broadcast(2, CLIENT_B, ins(0, 'X')))).toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// Two-peer convergence simulation
// ────────────────────────────────────────────────────────────
describe('Doc: two-peer convergence', () => {
  // Simulate the full Jupiter round-trip for two clients:
  //   1. Both A and B optimistically apply their ops
  //   2. Server processes A's op first (rev=1), broadcasts opA to B
  //   3. Server transforms opB against opA (bringing opB current), issues rev=2,
  //      broadcasts the transformed opB to A
  // Both docs end with identical content.
  function simulate(initialText: string, opA: Op, opB: Op): { textA: string; textB: string } {
    const docA = mkDoc(initialText, 0, CLIENT_A);
    const docB = mkDoc(initialText, 0, CLIENT_B);

    docA.applyLocal(opA);
    docB.applyLocal(opB);

    // Server receives A's op → rev=1; A acks, B receives opA broadcast
    docA.ack(1);
    docB.receiveRemote(broadcast(1, CLIENT_A, opA));

    // Server must transform B's original op against opA to bring it current
    // before it can apply and store it (this is what the /ops route does).
    const serverOpB = transform(opB, opA, CLIENT_B, CLIENT_A);

    if (serverOpB === null) {
      // B's op was entirely consumed by the overlap → no new revision
      docB.ackNoOp(0);
      // A receives no rev=2 broadcast
    } else {
      docB.ack(2);
      // A receives the server-transformed opB (not the original opB)
      docA.receiveRemote(broadcast(2, CLIENT_B, serverOpB));
    }

    return { textA: getText(docA), textB: getText(docB) };
  }

  it('two inserts at different positions converge', () => {
    const { textA, textB } = simulate('hello', ins(0, 'A'), ins(5, 'B'));
    expect(textA).toBe(textB);
    // A inserts at 0 → "Ahello"; server transforms B's ins(5,'B') → ins(6,'B') → "AhelloB"
    expect(textA).toBe('AhelloB');
  });

  it('two inserts at same position converge (tiebreak by clientId)', () => {
    const { textA, textB } = simulate('hello', ins(2, 'X'), ins(2, 'Y'));
    expect(textA).toBe(textB);
    // CLIENT_A < CLIENT_B, so A wins = stays put; Y shifts right
    expect(textA).toBe('heXYllo');
  });

  it('insert and remove at non-overlapping positions converge', () => {
    const { textA, textB } = simulate('hello', ins(0, 'Z'), rem(4, 'o'));
    expect(textA).toBe(textB);
    expect(textA).toBe('Zhell');
  });

  it('remove then insert inside removed range converge', () => {
    // A removes "ell" (1-3); B inserts "X" at position 2
    const { textA, textB } = simulate('hello', rem(1, 'ell'), ins(2, 'X'));
    expect(textA).toBe(textB);
  });

  it('identical removes on both peers converge (null ack path)', () => {
    const initialText = 'abcde';
    const docA = mkDoc(initialText, 0, CLIENT_A);
    const docB = mkDoc(initialText, 0, CLIENT_B);
    const sharedOp = rem(1, 'bcd');

    docA.applyLocal(sharedOp);
    docB.applyLocal(sharedOp);

    docA.ack(1);

    // B receives A's identical remove — transform should return null
    const transformedForB = docB.receiveRemote(broadcast(1, CLIENT_A, sharedOp));
    expect(transformedForB).toBeNull();

    // B's pending op is now null too (fully overlapped) — server sends ackNoOp
    docB.ackNoOp(0);

    // A receives B's op — but B's effective op was null, so we skip broadcast in real
    // system. Simulate server skipping: A does not receive a rev=2 broadcast.
    // Just verify both docs have the same content.
    expect(getText(docA)).toBe(getText(docB));
    expect(getText(docA)).toBe('ae');
  });

  it('multiple sequential local ops from A followed by remote from B converge', () => {
    const docA = mkDoc('hello', 0, CLIENT_A);
    const docB = mkDoc('hello', 0, CLIENT_B);

    // A applies two local ops
    docA.applyLocal(ins(5, '!')); // "hello!"
    docA.applyLocal(ins(0, 'Say: ')); // "Say: hello!"

    // B applies one op
    docB.applyLocal(rem(0, 'h')); // "ello"

    // Server processes A's first op as rev=1
    docA.ack(1);

    // B receives A's first op (ins(5, '!'))
    docB.receiveRemote(broadcast(1, CLIENT_A, ins(5, '!')));

    // Server processes A's second op as rev=2
    docA.ack(2);

    // B receives A's second op (ins(0, 'Say: '))
    docB.receiveRemote(broadcast(2, CLIENT_A, ins(0, 'Say: ')));

    // Server processes B's pending op as rev=3
    docB.ack(3);

    // Server transforms B's original rem(0,'h') against A's two ops before broadcasting to A:
    // transform against ins(5,'!') → unchanged (insert is after remove range)
    // transform against ins(0,'Say: ') → rem(0+5,'h') = rem(5,'h') (shift right by 5)
    docA.receiveRemote(broadcast(3, CLIENT_B, rem(5, 'h')));

    expect(getText(docA)).toBe(getText(docB));
  });
});

// ────────────────────────────────────────────────────────────
// receiveRemote with no pending ops
// ────────────────────────────────────────────────────────────
describe('Doc: receiveRemote with no pending ops', () => {
  it('applies server op directly when no pending ops', () => {
    const doc = mkDoc('hello', 0, CLIENT_A);
    const result = doc.receiveRemote(broadcast(1, CLIENT_B, ins(5, '!')));
    expect(result).toEqual(ins(5, '!'));
    expect(getText(doc)).toBe('hello!');
    expect(doc.revision).toBe(1);
  });

  it('multiple server ops applied in sequence', () => {
    const doc = mkDoc('hi', 0, CLIENT_A);
    doc.receiveRemote(broadcast(1, CLIENT_B, ins(2, ' there')));
    doc.receiveRemote(broadcast(2, CLIENT_B, ins(0, 'Oh, ')));
    expect(getText(doc)).toBe('Oh, hi there');
    expect(doc.revision).toBe(2);
  });
});
