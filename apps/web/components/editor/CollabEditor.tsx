'use client';

import type { PendingOp, ServerBroadcast } from '@app/collab';
import { useDoc } from '@app/collab/slate';
import { useCallback, useEffect } from 'react';
import type { Descendant } from 'slate';
import { Editable, Slate } from 'slate-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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
  const sendOp = useCallback(
    async (pending: PendingOp) => {
      const res = await fetch(`/api/docs/${docId}/ops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientRev: pending.clientRev, op: pending.op }),
      });
      return res.json();
    },
    [docId],
  );

  const { editor, value, onSlateChange, receiveRemote } = useDoc(
    docId,
    initialContent,
    initialRev,
    userId,
    sendOp,
  );

  // Subscribe to Supabase Realtime broadcast for remote ops
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`doc:${docId}`)
      .on('broadcast', { event: 'op' }, ({ payload }: { payload: ServerBroadcast }) => {
        // Filter out echoes of our own ops — the HTTP ack already handled those
        if (payload.clientId !== userId) {
          receiveRemote(payload);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [docId, userId, receiveRemote]);

  return (
    <Slate editor={editor} initialValue={value} onChange={onSlateChange}>
      <Editable
        placeholder="Start typing…"
        style={{
          minHeight: '400px',
          padding: '1rem',
          fontFamily: 'monospace',
          fontSize: '1rem',
          lineHeight: '1.6',
          border: '1px solid #e4e4e7',
          borderRadius: '0.375rem',
          outline: 'none',
        }}
      />
    </Slate>
  );
}
