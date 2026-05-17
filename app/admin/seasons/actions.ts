'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import { createServiceClient } from '@/lib/supabase/service';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  if (!await isAdminUser(user.id)) return { user: null };
  return { user };
}

export async function createSeason(formData: FormData): Promise<void> {
  const { user } = await verifyAdmin();
  if (!user) redirect('/wardrobe');

  const name      = (formData.get('name') as string).trim();
  const starts_at = (formData.get('starts_at') as string) || null;
  const ends_at   = (formData.get('ends_at') as string) || null;
  const min_users = parseInt(formData.get('min_users') as string, 10);

  if (!name || isNaN(min_users)) {
    redirect('/admin/seasons/new?error=' + encodeURIComponent('Season name and minimum users are required.'));
  }

  const db = createServiceClient();
  const { data: season, error } = await db
    .from('seasons')
    .insert({ name, starts_at, ends_at, min_users })
    .select('id')
    .single();

  if (error || !season) {
    redirect('/admin/seasons/new?error=' + encodeURIComponent(error?.message ?? 'Failed to create season.'));
  }

  revalidatePath('/admin/seasons');
  redirect(`/admin/seasons/${season.id}`);
}
