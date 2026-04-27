import { listDocumentMembers, loadDocument, withServerContext } from '@app/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const result = await withServerContext(async (ctx) => {
    const doc = await loadDocument(ctx, docId);
    if (!doc) return null;
    const members = await listDocumentMembers(ctx, docId);
    return {
      id: doc.id,
      title: doc.title,
      currentRevision: doc.currentRevision,
      content: doc.content,
      members: members.map((m) => ({
        userId: (m.user as { id: string }).id,
        joinedAt: m.joinedAt,
      })),
    };
  });

  if (!result) return new Response(null, { status: 404 });
  return Response.json(result);
}
