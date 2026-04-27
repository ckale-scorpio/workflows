import type { Op, SlateDescendant, SlateElement, SlateText } from './types';

// Applies one Op to a Slate content array, returning a new (immutable) array.
// Phase 1 constraint: document is always a single paragraph with a single text node.
// Both insert_text and remove_text target path [0, 0].
export function applyOp(content: SlateDescendant[], op: Op | null): SlateDescendant[] {
  if (op === null) return content;

  const block = content[op.path[0] ?? 0] as SlateElement | undefined;
  if (!block || !('children' in block)) return content;

  const textNode = block.children[op.path[1] ?? 0] as SlateText | undefined;
  if (!textNode || typeof textNode.text !== 'string') return content;

  const text = textNode.text;
  let newText: string;

  if (op.type === 'insert_text') {
    newText = text.slice(0, op.offset) + op.text + text.slice(op.offset);
  } else {
    newText = text.slice(0, op.offset) + text.slice(op.offset + op.text.length);
  }

  const newChildren = [...block.children];
  newChildren[op.path[1] ?? 0] = { ...textNode, text: newText };

  const newContent = [...content];
  newContent[op.path[0] ?? 0] = { ...block, children: newChildren };

  return newContent;
}
