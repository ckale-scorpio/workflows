import { EntitySchema } from '@mikro-orm/core';

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ProfileSchema = new EntitySchema<Profile>({
  name: 'Profile',
  tableName: 'profiles',
  properties: {
    id: { type: 'uuid', primary: true },
    email: { type: 'string' },
    fullName: { type: 'string', fieldName: 'full_name', nullable: true },
    stripeCustomerId: {
      type: 'string',
      fieldName: 'stripe_customer_id',
      nullable: true,
      unique: true,
    },
    createdAt: { type: Date, fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: {
      type: Date,
      fieldName: 'updated_at',
      defaultRaw: 'now()',
      onUpdate: () => new Date(),
    },
  },
});
