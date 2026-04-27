import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function EditorListPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function createDoc() {
    'use server';
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/docs`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    const doc = await res.json();
    redirect(`/app/editor/${doc.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Collaborative Editor</h1>
      <p className="text-zinc-500">Create a document and share the URL with a collaborator.</p>
      <form action={createDoc}>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-6 py-3 text-white hover:bg-zinc-700"
        >
          New Document
        </button>
      </form>
    </div>
  );
}
