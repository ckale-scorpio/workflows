import type { InsertTextOp, Op, RemoveTextOp } from './types';

// TP1 transform: returns `client` transformed to apply *after* `server` was applied,
// such that apply(apply(S, server), transform(client, server)) ===
//           apply(apply(S, client), transform(server, client)).
//
// `clientClientId` and `serverClientId` are Supabase auth UIDs used for deterministic
// tiebreaking when both ops share the same offset — lower string (lexicographic) wins.
//
// Returns null when the result is a no-op (overlapping deletions consumed the client op).
export function transform(
  client: Op,
  server: Op,
  clientClientId: string,
  serverClientId: string,
): Op | null {
  if (client.type === 'insert_text' && server.type === 'insert_text') {
    return transformInsertInsert(client, server, clientClientId, serverClientId);
  }
  if (client.type === 'remove_text' && server.type === 'remove_text') {
    return transformRemoveRemove(client, server);
  }
  if (client.type === 'insert_text' && server.type === 'remove_text') {
    return transformInsertRemove(client, server);
  }
  // remove_text × insert_text
  return transformRemoveInsert(client as RemoveTextOp, server as InsertTextOp);
}

function transformInsertInsert(
  client: InsertTextOp,
  server: InsertTextOp,
  clientClientId: string,
  serverClientId: string,
): InsertTextOp {
  const o = client.offset;
  const o2 = server.offset;

  if (o2 < o) {
    // Server inserted before client's position — shift client right
    return { ...client, offset: o + server.text.length };
  }
  if (o2 > o) {
    // Server inserted after client's position — no shift needed
    return client;
  }
  // Same offset: tiebreak by clientId (lexicographic, lower wins = goes first = server shifts us)
  if (serverClientId < clientClientId) {
    return { ...client, offset: o + server.text.length };
  }
  return client;
}

function transformRemoveRemove(client: RemoveTextOp, server: RemoveTextOp): Op | null {
  const s1 = client.offset;
  const e1 = s1 + client.text.length;
  const s2 = server.offset;
  const e2 = s2 + server.text.length;

  if (e2 <= s1) {
    // Server deletion entirely before client — shift client left
    return { ...client, offset: s1 - server.text.length };
  }
  if (s2 >= e1) {
    // Server deletion entirely after client — no change
    return client;
  }

  // Overlapping deletions: compute which client chars the server didn't already remove.
  // client.text[0..s2-s1) = chars before the overlap (from client's range)
  // client.text[e2-s1...) = chars after the overlap (from client's range)
  const beforeOverlap = Math.max(0, s2 - s1);
  const afterOverlap = Math.max(0, e2 - s1);
  const remaining = client.text.slice(0, beforeOverlap) + client.text.slice(afterOverlap);

  if (remaining === '') return null; // entire client deletion already done by server

  // The remaining chars are contiguous in the post-server string, starting at min(s1, s2)
  return { ...client, offset: Math.min(s1, s2), text: remaining };
}

function transformInsertRemove(client: InsertTextOp, server: RemoveTextOp): InsertTextOp | null {
  const o = client.offset;
  const o2 = server.offset;
  const e2 = o2 + server.text.length;

  if (e2 <= o) {
    // Server deleted entirely before insert point — shift left
    return { ...client, offset: o - server.text.length };
  }
  if (o2 >= o) {
    // Server deleted at or after insert point — no shift
    return client;
  }
  // Insert point was inside the deleted range — the context no longer exists.
  // Returning null (drop the insert) is required for TP1 convergence: the dual
  // transformRemoveInsert expands the deletion to swallow the inserted chars,
  // so both paths must end with the same result (no inserted text).
  return null;
}

function transformRemoveInsert(client: RemoveTextOp, server: InsertTextOp): RemoveTextOp {
  const o = client.offset;
  const endO = o + client.text.length;
  const o2 = server.offset;

  if (o2 <= o) {
    // Server inserted before or at remove start — shift right
    return { ...client, offset: o + server.text.length };
  }
  if (o2 >= endO) {
    // Server inserted after remove range — no change
    return client;
  }
  // Server inserted inside the range we want to delete — expand deletion to include new chars
  const prefix = client.text.slice(0, o2 - o);
  const suffix = client.text.slice(o2 - o);
  return { ...client, text: prefix + server.text + suffix };
}
