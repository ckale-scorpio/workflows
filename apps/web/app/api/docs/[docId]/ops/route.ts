import type { Op, SlateDescendant } from '@app/collab';
import { applyOp, transform } from '@app/collab';
import {
  listDocumentMembers,
  lockDocumentForUpdate,
  recordOperation,
  withTransactionalContext,
} from '@app/services';
import { env } from '@app/core/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface AcceptedOp {
  serverRev: number;
  clientId: string;
  op: Op;
}

type TxResult =
  | { kind: 'accepted'; accepted: AcceptedOp }
  | { kind: 'noop'; currentRevision: number };

export async function POST(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const { clientRev, op }: { clientRev: number; op: Op } = await request.json();

  // Verify membership — anyone not on the doc gets 403 before we touch the row lock
  const members = await withTransactionalContext(async (ctx) => {
    return listDocumentMembers(ctx, docId);
  });
  const isMember = members.some((m) => (m.user as { id: string }).id === user.id);
  if (!isMember) return new Response(null, { status: 403 });

  // Linearize: one op at a time, holding a PESSIMISTIC_WRITE lock for the full transaction.
  const txResult = await withTransactionalContext(async (ctx): Promise<TxResult> => {
    const { doc, concurrentOps } = await lockDocumentForUpdate(ctx, docId, clientRev, user.id);

    // Transform the client's op through every concurrent server op (in serverRev order)
    let transformedOp: Op | null = op;
    for (const serverOp of concurrentOps) {
      if (transformedOp === null) break;
      transformedOp = transform(
        transformedOp,
        serverOp.op as unknown as Op,
        user.id,
        serverOp.clientId,
      );
    }

    if (transformedOp === null) {
      // Concurrent deletes consumed this op entirely — nothing to record or broadcast
      return { kind: 'noop', currentRevision: doc.currentRevision };
    }

    const newRevision = doc.currentRevision + 1;
    const newContent = applyOp(doc.content as SlateDescendant[], transformedOp);

    await recordOperation(ctx, doc, {
      clientId: user.id,
      clientRev,
      serverRev: newRevision,
      op: transformedOp as unknown as Record<string, unknown>,
      newContent: newContent as Record<string, unknown>[],
      newRevision,
    });

    return {
      kind: 'accepted',
      accepted: { serverRev: newRevision, clientId: user.id, op: transformedOp },
    };
  });

  if (txResult.kind === 'accepted') {
    // Broadcast to the other peer via Supabase Realtime HTTP (stateless Route Handler — no WS)
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `realtime:doc:${docId}`,
            event: 'op',
            payload: txResult.accepted,
          },
        ],
      }),
    });

    return Response.json({ serverRev: txResult.accepted.serverRev, op: txResult.accepted.op });
  }

  // No-op: concurrent deletes cancelled this op; return current serverRev so client calls ackNoOp
  return Response.json({ serverRev: txResult.currentRevision, op: null });
}
