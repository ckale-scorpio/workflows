import { type Profile, ProfileSchema } from '@app/db';
import type { ServerContext } from '../context';

export async function findProfile(ctx: ServerContext, id: string): Promise<Profile | null> {
  return ctx.em.findOne(ProfileSchema, { id });
}

export async function findProfileByEmail(
  ctx: ServerContext,
  email: string,
): Promise<Profile | null> {
  return ctx.em.findOne(ProfileSchema, { email });
}

export interface UpsertProfileInput {
  id: string;
  email: string;
  fullName?: string | null;
  stripeCustomerId?: string | null;
}

export async function upsertProfile(
  ctx: ServerContext,
  input: UpsertProfileInput,
): Promise<Profile> {
  const existing = await ctx.em.findOne(ProfileSchema, { id: input.id });
  if (existing) {
    ctx.em.assign(existing, {
      email: input.email,
      fullName: input.fullName ?? existing.fullName,
      stripeCustomerId: input.stripeCustomerId ?? existing.stripeCustomerId,
    });
    return existing;
  }
  const now = new Date();
  return ctx.em.create(ProfileSchema, {
    id: input.id,
    email: input.email,
    fullName: input.fullName ?? null,
    stripeCustomerId: input.stripeCustomerId ?? null,
    createdAt: now,
    updatedAt: now,
  });
}
