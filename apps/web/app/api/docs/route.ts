import { createDocument, joinDocument, withServerContext } from '@app/services';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const result = await withServerContext(async (ctx) => {
    const doc = await createDocument(ctx, { title: 'Untitled' });
    await joinDocument(ctx, doc.id, user.id);
    return { id: doc.id, title: doc.title };
  });

  return Response.json(result, { status: 201 });
}
