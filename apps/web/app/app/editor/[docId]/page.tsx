import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Descendant } from 'slate';
import { CollabEditor } from '@/components/editor/CollabEditor';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function EditorPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');

  // Load doc snapshot
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/docs/${docId}`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Failed to load document');

  const doc = await res.json();

  // Auto-join if not already a member (first two users claim seats)
  const isMember = doc.members.some((m: { userId: string }) => m.userId === user.id);
  if (!isMember) {
    const joinRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/docs/${docId}/join`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    if (joinRes.status === 409) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-zinc-500">This document already has 2 collaborators.</p>
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <span className="text-sm text-zinc-400">rev {doc.currentRevision}</span>
        </div>
        <CollabEditor
          docId={docId}
          userId={user.id}
          initialContent={doc.content as Descendant[]}
          initialRev={doc.currentRevision}
        />
      </div>
    </div>
  );
}
