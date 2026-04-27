import { useCallback, useMemo, useRef, useState } from 'react';
import { createEditor, type Descendant, Transforms } from 'slate';
import { withReact } from 'slate-react';
import { Doc } from './doc';
import type { Op, PendingOp, ServerAck, ServerBroadcast } from './types';

export interface UseDocResult {
  editor: ReturnType<typeof withReact>;
  value: Descendant[];
  // Pass to <Slate onChange={onSlateChange}>
  onSlateChange: (newValue: Descendant[]) => void;
  // Call when the Realtime channel delivers a remote op
  receiveRemote: (broadcast: ServerBroadcast) => void;
}

export function useDoc(
  _docId: string,
  initialContent: Descendant[],
  initialRev: number,
  clientId: string,
  sendOp: (pending: PendingOp) => Promise<ServerAck>,
): UseDocResult {
  const editor = useMemo(() => withReact(createEditor()), []);

  const [value, setValue] = useState<Descendant[]>(initialContent);

  const docRef = useRef<Doc>(new Doc(initialContent as never, initialRev, clientId));

  // isRemote: true while applying a remote op so onSlateChange skips sending
  const isRemoteRef = useRef(false);

  // Serialized send queue: one op in flight at a time
  const sendingRef = useRef(false);
  const queueRef = useRef<PendingOp[]>([]);
  const sendOpRef = useRef(sendOp);
  sendOpRef.current = sendOp;

  const drainQueue = useCallback(() => {
    if (sendingRef.current || queueRef.current.length === 0) return;
    const pending = queueRef.current[0];
    if (!pending) return;

    sendingRef.current = true;

    sendOpRef
      .current(pending)
      .then((ack) => {
        queueRef.current.shift();
        if (ack.op === null) {
          docRef.current.ackNoOp(pending.clientRev);
        } else {
          docRef.current.ack(ack.serverRev);
        }
      })
      .catch((err) => {
        // On network error, discard the op for now (demo-quality error handling)
        console.error('[collab] sendOp failed:', err);
        queueRef.current.shift();
      })
      .finally(() => {
        sendingRef.current = false;
        drainQueue();
      });
  }, []);

  const onSlateChange = useCallback(
    (newValue: Descendant[]) => {
      if (isRemoteRef.current) {
        // Change originated from a remote op we applied — just sync React state
        setValue(newValue);
        return;
      }

      // Filter Slate's operation list to text ops only.
      // Slate emits set_selection, split_node, set_node, etc. — ignore those in Phase 1.
      const textOps = editor.operations.filter(
        (
          op,
        ): op is {
          type: 'insert_text' | 'remove_text';
          path: number[];
          offset: number;
          text: string;
        } => op.type === 'insert_text' || op.type === 'remove_text',
      );

      for (const slateOp of textOps) {
        const collabOp: Op = {
          type: slateOp.type,
          path: slateOp.path,
          offset: slateOp.offset,
          text: slateOp.text,
        };
        const pending = docRef.current.applyLocal(collabOp);
        queueRef.current.push(pending);
      }

      setValue(newValue);
      drainQueue();
    },
    [editor, drainQueue],
  );

  const receiveRemote = useCallback(
    (broadcast: ServerBroadcast) => {
      const transformedOp = docRef.current.receiveRemote(broadcast);

      if (transformedOp !== null) {
        isRemoteRef.current = true;
        // Apply the transformed op directly to the Slate editor
        if (transformedOp.type === 'insert_text') {
          Transforms.insertText(editor, transformedOp.text, {
            at: { path: transformedOp.path as number[], offset: transformedOp.offset },
          });
        } else {
          Transforms.delete(editor, {
            at: {
              anchor: { path: transformedOp.path as number[], offset: transformedOp.offset },
              focus: {
                path: transformedOp.path as number[],
                offset: transformedOp.offset + transformedOp.text.length,
              },
            },
          });
        }
        isRemoteRef.current = false;
      }

      setValue([...editor.children]);
    },
    [editor],
  );

  return { editor, value, onSlateChange, receiveRemote };
}
