import { joinDocument, withServerContext } from '@app/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  try {
    await withServerContext(async (ctx) => {
      await joinDocument(ctx, docId, user.id);
    });
    return Response.json({ joined: true });
  } catch (err) {
    if ((err as { code?: string }).code === 'DOC_FULL') {
      return Response.json({ error: 'Document is full' }, { status: 409 });
    }
    throw err;
  }
}
