---
date: 2026-04-22
author: chetan
branch: infra
tags: [plan, collaborative-editing, slate, ot, tp1, supabase, realtime]
status: draft
---

# Collaborative Slate Editor — Implementation Plan

## Overview

Build a web-based collaborative text editor where up to 2 authenticated users edit the same document simultaneously and converge to identical content. Operational Transformation (TP1) is the convergence mechanism. The TP1 engine lives in a new platform package (`@app/collab`) that is Slate-agnostic; the Slate editor is just one consumer. Persistence uses the existing Supabase Postgres database via MikroORM; Supabase Realtime Broadcast delivers low-latency op fan-out between peers.

## Current State Analysis

- No collaborative editing code exists anywhere in the repo.
- Slate is not installed. The web app has Supabase SSR auth, MikroORM, and Supabase Realtime available (realtime is enabled in `supabase/config.toml:81-82`).
- `SUPABASE_SERVICE_ROLE_KEY` is validated in `@app/shared/env` but not yet used — we need it server-side for Realtime broadcasting.
- Biome's `noRestrictedImports` (`biome.json:43-53`) enforces that only `@app/server` and `@app/db` may import `@app/db` or MikroORM. The new `@app/collab` package must go through `@app/server` services for all persistence — the same pattern as `@app/workflows`.
- The proxy (`apps/web/proxy.ts`) already gates `/app/*` behind Supabase auth — editor routes under `/app/editor/[docId]` inherit this for free.

## Desired End State

Two authenticated users open the same `/app/editor/[docId]` URL. Both type simultaneously. After a network round-trip, both editors display identical content. Refreshing the page recovers the full document. The convergence guarantee is TP1: for any two concurrent operations O1 and O2 generated from the same document state, applying O1 then `transform(O2, O1)` yields the same result as applying O2 then `transform(O1, O2)`.

**Verification:**
1. Open two browser tabs to the same doc URL (different Supabase user sessions)
2. Type simultaneously in both
3. Stop typing — both editors show the same text within one network RTT
4. Reload both tabs — content persists

### Key Discoveries

- `packages/server/src/context.ts:8-18` — `withServerContext` forks the EntityManager, flushes on success, clears in `finally`. All DB mutations go here; the new op-linearization logic follows this pattern.
- `packages/db/src/entities/Invoice.ts:48` — `metadata: jsonb` shows MikroORM handles arbitrary `Record<string,unknown>` payloads cleanly; operations will be stored the same way.
- `apps/web/app/api/inngest/route.ts` — the existing route handler pattern: import from `@app/workflows`, wire up, export HTTP methods. Op route handlers follow the same shape.
- `apps/web/lib/supabase/client.ts:4` — `createSupabaseBrowserClient()` is the existing browser Supabase entry point; the editor UI reuses it for Realtime channel subscriptions.

## What We Are NOT Doing

- **Tree-structure ops in Phase 1** — `split_node`, `merge_node`, `move_node`, `set_node` are deferred. Phase 1 is a single-paragraph, single-text-node document with only `insert_text` / `remove_text`.
- **Remote cursors / presence** — content convergence only. Presence via Supabase Realtime Presence is a follow-on.
- **Invite-by-email membership** — URL sharing only: first two authenticated users to load the doc claim seats.
- **Offline / reconnection** — no offline queue or reconnect replay. This is an online-only demo.
- **P2P transport** — central-server model only. This is what makes TP1 alone sufficient.
- **Rich text formatting** — bold, italic, links, etc. are out of scope. Plain paragraph text only.
- **Realtime channel RLS** — Supabase's per-channel authorization is in beta. The demo relies on UUID-obscured channel names; production hardening is documented as follow-up.

## Implementation Approach

Four packages touch this feature. Three have new content; one is brand new.

```
@app/db         — 3 new EntitySchema classes + migration
@app/server     — 2 new service files (documents.ts, operations.ts)
@app/collab     — NEW. TP1 transform, Doc class, Slate adapter. Zero @app/db dependency.
@app/web        — 4 new route handlers + 2 new pages + 1 reusable component
```

**Dependency flow (no new circular deps):**

```
@app/collab   ←  @app/web (Route Handlers + client components)
@app/server   ←  @app/web (Route Handlers)
@app/server   ←  @app/collab  [NO: collab stays server-agnostic]
```

The Route Handler at `POST /api/docs/[docId]/ops` is the orchestration boundary — it imports both `@app/collab` (for `transform` and `applyOp`) and `@app/server` (for persistence). This mirrors how `pay-invoice.ts` imports both `@app/server` services and Inngest agent functions without coupling them to each other (`packages/workflows/src/invoices/pay-invoice.ts:7-8`).

**Linearization:** a `PESSIMISTIC_WRITE` row lock on the `documents` row (via MikroORM `LockMode.PESSIMISTIC_WRITE`) inside a single `withServerContext` call ensures one op at a time advances the document revision. No race condition is possible.

---

## Phase 1: Database Layer

### Overview

Add three new entities and a MikroORM migration. Add services to `@app/server` that expose all document/operation mutations. No UI, no `@app/collab` yet.

### Changes Required

#### 1. Entities — `packages/db/src/entities/`

**`Document.ts`**
```typescript
export interface Document {
  id: string;
  title: string;
  currentRevision: number;  // monotonically increasing; 0 = no ops yet
  content: Record<string, unknown>[];  // Slate Descendants as jsonb
  createdAt: Date;
  updatedAt: Date;
}

export const DocumentSchema = new EntitySchema<Document>({
  name: 'Document',
  tableName: 'documents',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    title: { type: 'string', default: 'Untitled' },
    currentRevision: { type: 'integer', fieldName: 'current_revision', default: 0 },
    content: { type: 'jsonb', default: '[{"type":"paragraph","children":[{"text":""}]}]' },
    createdAt: { type: Date, fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: Date, fieldName: 'updated_at', defaultRaw: 'now()', onUpdate: () => new Date() },
  },
});
```

**`DocumentMember.ts`**
```typescript
export interface DocumentMember {
  id: string;
  document: Document;
  user: Profile;
  joinedAt: Date;
}

export const DocumentMemberSchema = new EntitySchema<DocumentMember>({
  name: 'DocumentMember',
  tableName: 'document_members',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    document: { kind: 'm:1', entity: 'Document', fieldName: 'document_id', deleteRule: 'cascade', index: true },
    user: { kind: 'm:1', entity: 'Profile', fieldName: 'user_id', deleteRule: 'cascade', index: true },
    joinedAt: { type: Date, fieldName: 'joined_at', defaultRaw: 'now()' },
  },
  uniques: [{ properties: ['document', 'user'] }],
});
```

**`DocumentOperation.ts`**
```typescript
export interface DocumentOperation {
  id: string;
  document: Document;
  serverRev: number;      // assigned by server; unique per document
  clientId: string;       // Supabase auth UID of submitting user
  clientRev: number;      // the document revision the client saw before this op
  op: Record<string, unknown>;  // serialized Op (jsonb)
  appliedAt: Date;
}

export const DocumentOperationSchema = new EntitySchema<DocumentOperation>({
  name: 'DocumentOperation',
  tableName: 'document_operations',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    document: { kind: 'm:1', entity: 'Document', fieldName: 'document_id', deleteRule: 'cascade', index: true },
    serverRev: { type: 'integer', fieldName: 'server_rev' },
    clientId: { type: 'string', fieldName: 'client_id' },
    clientRev: { type: 'integer', fieldName: 'client_rev' },
    op: { type: 'jsonb' },
    appliedAt: { type: Date, fieldName: 'applied_at', defaultRaw: 'now()' },
  },
  uniques: [{ properties: ['document', 'serverRev'] }],  // serialization guarantee
});
```

Update `packages/db/src/entities/index.ts` to export the three new schemas and include them in the `entities` array.

#### 2. Migration — `packages/db/migrations/`

Run `pnpm db:generate` to produce the migration after entities are registered. The generated SQL will:

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled',
  current_revision INTEGER NOT NULL DEFAULT 0,
  content JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id)
);
CREATE INDEX idx_document_members_document_id ON document_members(document_id);
CREATE INDEX idx_document_members_user_id ON document_members(user_id);

CREATE TABLE document_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  server_rev INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  client_rev INTEGER NOT NULL,
  op JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, server_rev)
);
CREATE INDEX idx_document_operations_document_id_server_rev ON document_operations(document_id, server_rev);
```

#### 3. Services — `packages/server/src/services/`

**`documents.ts`** — document lifecycle:
```typescript
export async function createDocument(ctx, input: { title: string; ownerId: string }): Promise<Document>
export async function loadDocument(ctx, docId: string): Promise<Document | null>
export async function listDocumentMembers(ctx, docId: string): Promise<DocumentMember[]>
export async function joinDocument(ctx, docId: string, userId: string): Promise<DocumentMember>
  // throws if already 2 members; idempotent if user already joined
export interface LockResult { doc: Document; concurrentOps: DocumentOperation[] }
export async function lockDocumentForUpdate(ctx, docId: string, sinceRev: number, excludeClientId: string): Promise<LockResult>
  // PESSIMISTIC_WRITE lock; returns doc + ops since sinceRev in ASC serverRev order,
  // filtering out rows where client_id = excludeClientId (the submitting user's own prior ops).
```

**`operations.ts`** — operation persistence:
```typescript
export interface RecordOperationInput {
  clientId: string;
  clientRev: number;
  serverRev: number;
  op: Record<string, unknown>;
  newContent: Record<string, unknown>[];
  newRevision: number;
}
export async function recordOperation(ctx, docId: string, input: RecordOperationInput): Promise<void>
  // inserts DocumentOperation + updates Document.currentRevision + Document.content atomically
```

Update `packages/server/src/index.ts` barrel to export all new types and functions.

#### 4. Biome safeguard for `@app/collab`

When the collab package is created, add an override to `biome.json` so it can never accidentally import `@app/server` (which would create a back-reference):

```json
{
  "includes": ["**/packages/collab/**"],
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "@app/server": "@app/collab is platform code; it must not import @app/server."
            }
          }
        }
      }
    }
  }
}
```

The existing global restriction already prevents `@app/collab` from importing `@app/db` or MikroORM.

### Success Criteria

#### Automated Verification
- [x] Migration generates without error: `pnpm db:generate` (authored manually)
- [x] Migration applies cleanly: `pnpm db:migrate` (via `pnpm db:reset`)
- [x] TypeScript compiles: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`

#### Manual Verification
- [ ] Supabase Studio shows three new tables with expected schema
- [ ] A row can be manually inserted and `UNIQUE(document_id, server_rev)` constraint rejects duplicates

**Pause here for manual confirmation before Phase 2.**

---

## Phase 2: `@app/collab` Platform Package

### Overview

Create the new `packages/collab` workspace package. This is the heart of the feature: the TP1 transform function, the `Doc` class (client-side collaborative state machine), and the Slate adapter that bridges `Doc` into a Slate `<Editor>`. The package has no dependency on `@app/db` or `@app/server`.

### Package Structure

```
packages/collab/
├── package.json           name: @app/collab
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts           exports: types, transform, applyOp, Doc
    ├── types.ts           Op type definitions
    ├── transform.ts       TP1 transform function
    ├── apply.ts           applyOp — applies one Op to Slate Descendants[]
    ├── doc.ts             Doc class
    └── slate-adapter.ts   useDoc React hook (depends on slate + slate-react)
```

Export paths in `package.json`:
```json
{
  "exports": {
    ".": "./src/index.ts",
    "./slate": "./src/slate-adapter.ts"
  }
}
```

Core exports (`.`) have zero external runtime dependencies. The `./slate` export peer-deps on `slate`, `slate-react`, and `react`.

### Changes Required

#### 1. `types.ts` — Op primitives

Phase 1 operations are text-only on a fixed path. We define our own path type (no Slate dependency in core):

```typescript
// A path into the Slate tree: [blockIndex, inlineIndex]
// Phase 1: always [0, 0] (single paragraph, single text node)
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
  text: string;  // the characters removed (length = text.length)
}

export type Op = InsertTextOp | RemoveTextOp;

// An op that has been queued locally but not yet acknowledged by the server
export interface PendingOp {
  clientRev: number;   // the doc revision when this op was generated
  op: Op;
}

// What the server broadcasts after accepting an op
export interface ServerBroadcast {
  serverRev: number;
  clientId: string;
  op: Op;
}

// What the Route Handler returns to the submitting client on success
export interface ServerAck {
  serverRev: number;
  op: Op;  // the (possibly transformed) op that was accepted
}
```

#### 2. `transform.ts` — TP1 transformation function

This is the mathematical core. For Phase 1 (flat text, single path), both ops always target the same path `[0, 0]`, so path adjustment reduces to character-offset adjustment.

The function `transform(client: Op, server: Op, clientClientId: string, serverClientId: string): Op | null` returns `client` transformed such that it can be applied *after* `server` to reach the same state as if applied concurrently. The `clientClientId` and `serverClientId` parameters are Supabase auth UIDs used for deterministic tiebreaking when both ops share the same offset — both peers must agree on the same winner, so the lower string (lexicographic) wins.

**All four cases (client op × server op):**

```
T(insert(o, s), insert(o2, s2)):
  if o2 <  o :  return insert(o + len(s2), s)    // server inserted before client
  if o2 >  o :  return insert(o, s)               // server inserted after client, no shift
  if o2 == o :  tiebreak by clientId — if server.clientId < client.clientId:
                  return insert(o + len(s2), s)   // server wins the tie
                else:
                  return insert(o, s)

T(remove(o, t), remove(o2, t2)):
  let [s1, e1] = [o, o + len(t)]
  let [s2, e2] = [o2, o2 + len(t2)]
  if e2 <= s1: return remove(o - len(t2), t)      // server del entirely before client
  if s2 >= e1: return remove(o, t)                // server del entirely after client
  // overlapping deletions — remove only the characters client wanted that server didn't already remove:
  let remaining = t.slice(0, max(0, s2 - s1)) + t.slice(max(0, e2 - s1))
  if remaining === '': return null                 // nothing left to remove (no-op)
  return remove(min(o, o2), remaining)

T(insert(o, s), remove(o2, t2)):
  let e2 = o2 + len(t2)
  if e2 <= o: return insert(o - len(t2), s)       // server del entirely before insert point
  if o2 >= o: return insert(o, s)                  // server del at/after insert point
  return insert(o2, s)                             // insert point was inside deleted range → move to start of deletion

T(remove(o, t), insert(o2, s2)):
  if o2 <= o: return remove(o + len(s2), t)       // server insert before/at remove start
  if o2 >= o + len(t): return remove(o, t)         // server insert after remove range
  // server inserted inside the range we want to delete → expand deletion to include new chars
  let prefix = t.slice(0, o2 - o)
  let suffix = t.slice(o2 - o)
  return remove(o, prefix + s2 + suffix)
```

**Note on `null` return:** when overlapping deletions leave nothing to remove, `transform` returns `null` (a no-op). The caller must handle `null`.

#### 3. `apply.ts` — applyOp

Applies one `Op` to a `Slate.Descendant[]` value (the document content), returning a new content array. This is a pure function used both in the `Doc` class and server-side in the Route Handler (to keep `documents.content` up-to-date).

Phase 1: the document is always `[{ type: 'paragraph', children: [{ text: '' }] }]`. The function finds the text node at `op.path`, splices the text, returns the updated tree.

```typescript
export function applyOp(content: SlateDescendant[], op: Op | null): SlateDescendant[]
```

#### 4. `doc.ts` — Doc class

The client-side collaborative state machine. Maintains:
- `content: SlateDescendant[]` — current document content
- `serverRev: number` — the revision of the last op the server acknowledged
- `pending: PendingOp[]` — ops generated locally but not yet acknowledged

```typescript
export class Doc {
  constructor(initialContent: SlateDescendant[], initialRev: number)

  // Called when the user edits locally. Returns the PendingOp to send to the server.
  applyLocal(op: Op): PendingOp

  // Called when the server broadcasts a remote op (from the other peer).
  // Transforms op against all pending local ops before applying.
  receiveRemote(serverOp: ServerBroadcast): void

  // Called when the server acknowledges our own op (op: Op in the ack body).
  // Removes the corresponding PendingOp from the queue and advances serverRev.
  ack(serverRev: number): void

  // Called when the server acknowledges our own op as a no-op (op: null in the ack body).
  // Pops the pending queue without advancing serverRev — the server state did not change.
  ackNoOp(clientRev: number): void

  // Returns current content for Slate
  get value(): SlateDescendant[]

  // Returns current server revision
  get revision(): number
}
```

**`applyLocal` implementation:**
1. Apply op immediately to `content` (optimistic)
2. Push `{ clientRev: serverRev + pending.length, op }` to `pending`
3. Return the PendingOp

**`receiveRemote` implementation:**
1. Verify `serverOp.serverRev === serverRev + 1` (monotonic)
2. Transform `serverOp.op` against each PendingOp (in order) using `transform`
3. Apply the final transformed op to `content`
4. Increment `serverRev`
5. Re-compute pending ops: transform each PendingOp against the received server op

Step 5 is the Jupiter client-side sweep: after receiving a server op, all in-flight local ops must be re-transformed as if they will be applied after the new server state.

**`ack` implementation:**
1. Assert pending[0].clientRev matches the ack
2. Remove pending[0]
3. Increment `serverRev`

#### 5. `slate-adapter.ts` — `useDoc` React hook

```typescript
import { useState, useCallback, useEffect } from 'react';
import { createEditor } from 'slate';
import { withReact } from 'slate-react';
import type { Descendant } from 'slate';
import { Doc, Op, ServerBroadcast } from './index';

export interface UseDocResult {
  editor: ReturnType<typeof withReact>;
  value: Descendant[];
  // Called by Slate's onChange handler
  onSlateChange: (newValue: Descendant[], operations: SlateCoreOperation[]) => void;
  // Ready to receive remote ops once connected
  receiveRemote: (broadcast: ServerBroadcast) => void;
}

export function useDoc(
  docId: string,
  initialContent: Descendant[],
  initialRev: number,
  sendOp: (pending: PendingOp) => Promise<ServerAck>,
): UseDocResult
```

The hook:
1. Creates a `Doc` instance (stable ref via `useRef`)
2. Returns `value` from `doc.value` (React state driven by doc mutations)
3. `onSlateChange` receives Slate's full operation list which includes selection ops (`set_selection`), structural ops (`split_node`, `set_node`, etc.), and text ops. The hook **filters to only `insert_text` and `remove_text`** before processing — all other op types are ignored in Phase 1. Each surviving text op is converted to our `Op` type, then `doc.applyLocal` is called and the result POSTed to the server via `sendOp`
4. `receiveRemote` calls `doc.receiveRemote` and triggers a React re-render

The hook does **not** manage the Supabase Realtime subscription — that belongs in the page component, which calls `receiveRemote` when broadcasts arrive.

#### 6. Unit and Property-Based Tests

**`src/transform.test.ts`:**
- Test all 4 op-pair cases (insert×insert, remove×remove, insert×remove, remove×insert)
- Edge cases: overlapping ranges, same offset, empty string result
- Convergence property: for any two concurrent ops (O1, O2) on the same initial string:
  `apply(apply(s, O1), transform(O2, O1)) === apply(apply(s, O2), transform(O1, O2))`
  Run with parametrized inputs across offset ranges.

**`src/doc.test.ts`:**
- Single peer: applyLocal + ack converges with no-op
- Two-peer simulation: O1 and O2 applied by two Doc instances, remote propagation converges

### Success Criteria

#### Automated Verification
- [ ] Package builds: `pnpm --filter @app/collab typecheck`
- [ ] All unit tests pass: `pnpm --filter @app/collab test`
- [ ] Property-based convergence tests pass (at minimum 50 randomized op pairs)
- [ ] No lint errors: `pnpm --filter @app/collab lint`
- [ ] The biome override blocks `@app/server` import inside collab: verify by temporarily importing @app/server and confirming lint error

#### Manual Verification
- [ ] Import `Doc` in a scratch script; create two Doc instances, apply concurrent ops, verify both end up with the same string

**Pause here for manual confirmation before Phase 3.**

---

## Phase 3: API Routes

### Overview

Four Route Handlers wire together `@app/server` (persistence) and `@app/collab` (transform + applyOp). A Supabase admin client (service role key) broadcasts accepted ops to all channel subscribers.

### Changes Required

#### 1. Supabase admin client — `apps/web/lib/supabase/admin.ts`

```typescript
import { env } from '@app/shared/env';
import { createClient } from '@supabase/supabase-js';

let cached: ReturnType<typeof createClient> | undefined;

export function createSupabaseAdminClient() {
  if (!cached) {
    cached = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return cached;
}
```

#### 2. Route Handlers

**`POST /api/docs`** — create document
```
apps/web/app/api/docs/route.ts
```
- Verify auth (Supabase session from cookie)
- `withServerContext` → `createDocument` + `joinDocument`
- Return `{ id, title }`

**`GET /api/docs/[docId]`** — load document + membership
```
apps/web/app/api/docs/[docId]/route.ts
```
- Verify auth
- Load doc + members
- Return `{ id, title, currentRevision, content, members: [{ userId, joinedAt }] }`

**`POST /api/docs/[docId]/join`** — claim a seat
```
apps/web/app/api/docs/[docId]/join/route.ts
```
- Verify auth
- `withServerContext` → `joinDocument` (throws if 2 seats taken)
- Return `{ joined: true }` or 409 Conflict

**`POST /api/docs/[docId]/ops`** — **linearization point** (the core route)
```
apps/web/app/api/docs/[docId]/ops/route.ts
```

Full orchestration:
```typescript
export async function POST(request, { params }) {
  const { docId } = await params;
  const { clientRev, op }: { clientRev: number; op: Op } = await request.json();

  // 1. Auth
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  // 2. Verify membership
  // (load member list, return 403 if user not found)

  // 3. Linearize atomically (row lock prevents concurrent ops on same doc)
  let broadcastPayload: ServerBroadcast | null = null;
  let noOpRevision: number | null = null;
  await withServerContext(async (ctx) => {
    // excludeClientId filters out this user's own prior ops — we must not re-transform
    // our own ops against themselves (they were already in the client's local state)
    const { doc, concurrentOps } = await lockDocumentForUpdate(ctx, docId, clientRev, user.id);

    // Transform client op against each concurrent server op (in serverRev order)
    let transformedOp: Op | null = op;
    for (const serverOp of concurrentOps) {
      if (transformedOp === null) break;
      transformedOp = transform(transformedOp, serverOp.op as Op, user.id, serverOp.clientId);
    }
    if (transformedOp === null) {
      // Concurrent deletions consumed this op entirely — nothing to record or broadcast.
      // Return the current serverRev so the client can ackNoOp and advance its own state.
      noOpRevision = doc.currentRevision;
      return;
    }

    const newRevision = doc.currentRevision + 1;
    const newContent = applyOp(doc.content as SlateDescendant[], transformedOp);

    await recordOperation(ctx, docId, {
      clientId: user.id,
      clientRev,
      serverRev: newRevision,
      op: transformedOp as Record<string, unknown>,
      newContent: newContent as Record<string, unknown>[],
      newRevision,
    });

    broadcastPayload = { serverRev: newRevision, clientId: user.id, op: transformedOp };
  });

  // 4. Broadcast to the other peer via Supabase Realtime HTTP broadcast endpoint.
  // Skip for no-ops — there is nothing for the other peer to apply.
  // The HTTP endpoint is used (not the realtime-js WS client) because Route Handlers
  // are stateless and cannot maintain a persistent WebSocket connection.
  if (broadcastPayload !== null) {
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        messages: [{
          topic: `realtime:doc:${docId}`,
          event: 'op',
          payload: broadcastPayload,
        }],
      }),
    });
  }

  // 5. Return ack to the submitting client.
  // For no-ops, return the current serverRev and op: null so the client calls ackNoOp.
  const ackRev = broadcastPayload?.serverRev ?? noOpRevision!;
  return Response.json({ serverRev: ackRev, op: broadcastPayload?.op ?? null });
}
```

**Note on Realtime broadcasting from the server:** The Supabase Realtime HTTP broadcast endpoint (`POST /realtime/v1/api/broadcast`) is used rather than the WebSocket-based `realtime-js` client because Next.js Route Handlers are stateless request handlers — they cannot maintain a persistent WS connection across requests. The HTTP endpoint accepts a `messages` array; each message's `topic` is prefixed with `realtime:` (matching Supabase's internal channel naming). The `Authorization` and `apikey` headers both carry the service role key. This endpoint is available in Supabase's self-hosted stack at `http://localhost:54321/realtime/v1/api/broadcast` for local development.

#### 3. Biome — allow `@app/collab` import in `apps/web`

No change needed — `@app/collab` is not a restricted import. Route Handlers in `apps/web` can import it freely.

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Route handler returns 401 for unauthenticated request: `curl -X POST http://localhost:3000/api/docs`

#### Manual Verification
- [ ] Create a document via `curl -X POST /api/docs` (with valid session cookie) — returns `{ id, title }`
- [ ] POST an op to `/api/docs/[id]/ops` — returns `{ serverRev: 1, op: ... }`
- [ ] Supabase Studio shows a row in `document_operations` with `server_rev = 1`
- [ ] A second POST with the same `clientRev = 0` (simulating concurrent op) returns a transformed op with `server_rev = 2`

**Pause here for manual confirmation before Phase 4.**

---

## Phase 4: Web UI

### Overview

Two pages and one editor component. The editor page wires `useDoc` to a Slate `<Editable>`, subscribes to the Realtime channel, and relays remote ops to the Doc instance. No styling beyond minimal legibility — this is a demo.

### Changes Required

#### 1. Install Slate

```
pnpm --filter @app/web add slate slate-react
pnpm --filter @app/collab add --save-peer slate slate-react react
```

#### 2. Editor listing — `apps/web/app/app/editor/page.tsx`

Server component. Lists the user's documents (their `document_members` rows). Provides a "New document" button that POSTs to `/api/docs` and redirects to the editor.

#### 3. Editor page — `apps/web/app/app/editor/[docId]/page.tsx`

Server component that loads the doc snapshot on first render (auth-gated via the proxy). Passes `initialContent` and `initialRev` to the client component.

#### 4. Editor client component — `apps/web/components/editor/CollabEditor.tsx`

```tsx
'use client';

import { useEffect, useCallback } from 'react';
import { Slate, Editable, withReact } from 'slate-react';
import { createEditor } from 'slate';
import { useDoc } from '@app/collab/slate';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Descendant } from 'slate';
import type { ServerBroadcast } from '@app/collab';

export function CollabEditor({
  docId,
  userId,
  initialContent,
  initialRev,
}: {
  docId: string;
  userId: string;
  initialContent: Descendant[];
  initialRev: number;
}) {
  const sendOp = useCallback(async (pending) => {
    const res = await fetch(`/api/docs/${docId}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRev: pending.clientRev, op: pending.op }),
    });
    return res.json();
  }, [docId]);

  const { editor, value, onSlateChange, receiveRemote } = useDoc(
    docId, initialContent, initialRev, sendOp,
  );

  // Subscribe to Realtime broadcast
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`doc:${docId}`)
      .on('broadcast', { event: 'op' }, ({ payload }: { payload: ServerBroadcast }) => {
        if (payload.clientId !== userId) {
          receiveRemote(payload);
        }
        // If payload.clientId === userId, this is the echo of our own broadcast.
        // The Route Handler already returned the ack via HTTP; ignore the broadcast echo.
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [docId, userId, receiveRemote]);

  return (
    <Slate editor={editor} initialValue={value} onChange={onSlateChange}>
      <Editable
        placeholder="Start typing..."
        style={{ minHeight: '400px', padding: '1rem', fontFamily: 'monospace' }}
      />
    </Slate>
  );
}
```

#### 5. Proxy matcher — no change needed

The proxy already matches `/app/*` for auth. The new routes `/app/editor` and `/app/editor/[docId]` are covered.

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

#### Manual Verification (the convergence test)
1. [ ] Start the dev server: `pnpm dev`
2. [ ] Log in as User A (tab 1). Create a new document. Copy the URL.
3. [ ] Open the URL in a Private Window as User B (tab 2). Both see the editor.
4. [ ] User A and User B type simultaneously (e.g., A types at position 0, B types at end).
5. [ ] After both stop typing, both tabs show **identical text** within 1–2 seconds.
6. [ ] Reload both tabs — content persists.
7. [ ] Attempt to open the URL in a third browser session — the join request returns 409.
8. [ ] Verify `document_operations` table: rows with `server_rev` 1, 2, 3… in order; `client_rev` values may not match `server_rev - 1` (evidence of transformation).

**This is the primary demonstration of TP1 convergence.**

---

## Testing Strategy

### Unit Tests (`pnpm --filter @app/collab test`)

The transform function is the only safety-critical code and must be exhaustively tested:
- All 4 op-type pairs × same-offset / before / after / overlapping position combinations
- The convergence property: for any string `s` and concurrent ops `O1`, `O2`:
  `apply(apply(s, O1), transform(O2, O1)) === apply(apply(s, O2), transform(O1, O2))`
  Parametrized over at least 50 generated (s, O1, O2) triples.
- Doc class: two-instance simulation (simulate a server echoing ops between two Doc instances)

### Integration Tests

Manual only (no automation stub yet). See Phase 4 manual steps.

### What We're Not Testing Automatically

- Supabase Realtime delivery (requires live Supabase stack)
- Row-lock correctness under concurrent load (verify manually by sending two ops in rapid succession and checking the `document_operations` table for monotonic `server_rev`)

---

## Performance Considerations

- For the 2-user demo, the pending op queue never grows beyond a handful of entries — transform cost is trivially O(n).
- `PESSIMISTIC_WRITE` on the documents row means ops on the same document are strictly sequential. This is fine for 2 users; it becomes a bottleneck at higher concurrency (not a concern here).
- The `document_operations(document_id, server_rev)` composite index makes `listOpsSince` a single index scan.
- `document.content` is updated on every op; no replay required on load.

---

## Migration Notes

- No data migration required — all three new tables are empty on creation.
- `pnpm db:generate` (after registering the new entities in `packages/db/src/entities/index.ts`) produces the migration file. Review the SQL before running `pnpm db:migrate`.
- To reset during development: `pnpm db:reset` drops all public tables and re-runs all migrations.

---

## Security Notes (Follow-Up Items, Not Phase 1–4 Scope)

- **Realtime channel authorization**: currently any authenticated user who knows the doc UUID can subscribe to `doc:${docId}`. The UUID provides obscurity, not true access control. For production, add Supabase Realtime Channel Authorization (RLS on channels) to verify membership before allowing subscription.
- **Op validation**: the Route Handler currently trusts the shape of the incoming `op`. Add Zod validation of the `Op` union type before processing.
- **Rate limiting**: the op route has no rate limit. Consider adding one (e.g., per-user per-doc per-minute) before exposing publicly.

---

## References

- Existing pattern: `packages/workflows/src/invoices/pay-invoice.ts` — how the workflow orchestration layer imports `@app/server` and platform packages (Inngest) without coupling them.
- DB boundary enforcement: `biome.json:43-53` — `noRestrictedImports`.
- Context pattern: `packages/server/src/context.ts:8-18` — `withServerContext` fork/flush/clear.
- Supabase browser client: `apps/web/lib/supabase/client.ts`.
- Supabase server client: `apps/web/lib/supabase/server.ts`.
- TP1 theorem: Nichols, D. A., et al. "High-latency, low-bandwidth windowing in the Jupiter collaboration system." UIST 1995.
