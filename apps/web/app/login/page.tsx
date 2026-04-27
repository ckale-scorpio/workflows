import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error: errorParam } = await searchParams;

  async function login(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      redirect(
        `/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ''}`,
      );
    }

    redirect(next ?? '/app/editor');
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        action={login}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-200 p-8"
      >
        <h1 className="text-xl font-semibold">Sign in</h1>

        {errorParam && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
            {decodeURIComponent(errorParam)}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
