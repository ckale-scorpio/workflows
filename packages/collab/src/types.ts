// Path into the Slate tree: [blockIndex, inlineIndex, ...]
// Phase 1 constraint: always [0, 0] (single paragraph, single text node)
export type SlatePath = readonly number[];

export interface InsertTextOp {
  type: 'insert_text';
  path: SlatePath;
  offset: number;
  text: string;
}

export interface RemoveTextOp {
  type: 'remove_text';
  path: SlatePath;
  offset: number;
  text: string; // the characters removed — text.length chars starting at offset
}

export type Op = InsertTextOp | RemoveTextOp;

// An op queued locally but not yet acknowledged by the server
export interface PendingOp {
  clientRev: number; // the server revision the client had when generating this op
  op: Op;
}

// Payload the server broadcasts after accepting an op
export interface ServerBroadcast {
  serverRev: number;
  clientId: string;
  op: Op;
}

// What the op Route Handler returns to the submitting client
export interface ServerAck {
  serverRev: number;
  op: Op | null; // null = the op was a no-op (concurrent deletions cancelled it)
}

// Loose structural type for a Slate tree node.
// Compatible with Slate's Descendant type without importing from 'slate'.
export interface SlateText {
  text: string;
  [key: string]: unknown;
}

export interface SlateElement {
  children: SlateDescendant[];
  [key: string]: unknown;
}

export type SlateDescendant = SlateText | SlateElement;
