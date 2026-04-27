import { applyOp } from './apply';
import { transform } from './transform';
import type { Op, PendingOp, ServerBroadcast, SlateDescendant } from './types';

// Internal representation: pending op may become null after re-transformation
// (the Jupiter sweep can consume it via overlapping deletions).
interface PendingEntry {
  clientRev: number;
  op: Op | null;
}

// Client-side collaborative state machine using the Jupiter algorithm.
//
// Usage lifecycle:
//  1. applyLocal(op) — optimistic local edit; returns PendingOp to send to server
//  2. ack(serverRev) / ackNoOp(clientRev) — server confirms or no-ops the pending op
//  3. receiveRemote(broadcast) — server delivers another peer's op; apply + sweep
export class Doc {
  private _content: SlateDescendant[];
  private _serverRev: number;
  private _pending: PendingEntry[];
  private readonly _clientId: string;

  constructor(initialContent: SlateDescendant[], initialRev: number, clientId: string) {
    this._content = initialContent;
    this._serverRev = initialRev;
    this._pending = [];
    this._clientId = clientId;
  }

  applyLocal(op: Op): PendingOp {
    const pending: PendingOp = { clientRev: this._serverRev, op };
    this._content = applyOp(this._content, op);
    this._pending.push({ clientRev: this._serverRev, op });
    return pending;
  }

  // Returns the transformed op that was applied to content (null = no-op after transform).
  receiveRemote(serverOp: ServerBroadcast): Op | null {
    if (serverOp.serverRev !== this._serverRev + 1) {
      throw new Error(
        `Out-of-order server op: expected rev ${this._serverRev + 1}, got ${serverOp.serverRev}`,
      );
    }

    // Step 1: transform the server op through all pending local ops so it can apply to
    // our current (optimistically-updated) content.
    let remoteOp: Op | null = serverOp.op;
    for (const p of this._pending) {
      if (remoteOp === null) break;
      if (p.op === null) continue;
      remoteOp = transform(remoteOp, p.op, serverOp.clientId, this._clientId);
    }

    if (remoteOp !== null) {
      this._content = applyOp(this._content, remoteOp);
    }
    this._serverRev++;

    // Step 2: Jupiter sweep — re-transform all pending ops to be correct in a world
    // where the server op was applied first. `s` tracks the "server op advanced through
    // previously-processed pending ops" so each pending op is transformed against the
    // right diamond side.
    let s: Op | null = serverOp.op;
    this._pending = this._pending.map((entry) => {
      const oldOp = entry.op;

      const newOp =
        oldOp !== null && s !== null
          ? transform(oldOp, s, this._clientId, serverOp.clientId)
          : oldOp;

      // Advance s past this pending op (using the OLD pending op, not the new one)
      if (s !== null && oldOp !== null) {
        s = transform(s, oldOp, serverOp.clientId, this._clientId);
      } else if (oldOp === null) {
        // s unchanged; this slot was already a no-op
      } else {
        s = null; // s consumed, future pending ops won't shift further
      }

      return { clientRev: entry.clientRev, op: newOp };
    });

    return remoteOp;
  }

  // Server acknowledged our op with a new server revision.
  ack(serverRev: number): void {
    const p = this._pending.shift();
    if (!p) throw new Error('ack called with empty pending queue');
    this._serverRev = serverRev;
  }

  // Server acknowledged our op as a no-op (concurrent deletions cancelled it).
  // Pops the queue without advancing serverRev — the server created no new revision.
  ackNoOp(clientRev: number): void {
    const p = this._pending.shift();
    if (!p) throw new Error('ackNoOp called with empty pending queue');
    if (p.clientRev !== clientRev) {
      throw new Error(`ackNoOp clientRev mismatch: expected ${p.clientRev}, got ${clientRev}`);
    }
    // _serverRev intentionally unchanged
  }

  get value(): SlateDescendant[] {
    return this._content;
  }

  get revision(): number {
    return this._serverRev;
  }
}
