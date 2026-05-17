'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  if (!await isAdminUser(user.id)) return { supabase: null, user: null };
  return { supabase, user };
}

// Used as native HTML form action — must return void.
// Errors redirect back with ?error= query param.
export async function createSeason(formData: FormData): Promise<void> {
  const { supabase, user } = await verifyAdmin();
  if (!supabase || !user) redirect('/wardrobe');

  const name         = (formData.get('name') as string).trim();
  const starts_at    = formData.get('starts_at') as string;
  const ends_at      = formData.get('ends_at') as string;
  const min_users    = parseInt(formData.get('min_users') as string, 10);
  const demand_level = formData.get('demand_level') as string;

  if (!name || !starts_at || !ends_at || isNaN(min_users)) {
    redirect('/admin/seasons/new?error=' + encodeURIComponent('All required fields must be filled.'));
  }

  const { data: season, error } = await supabase
    .from('seasons')
    .insert({ name, starts_at, ends_at, min_users, demand_level })
    .select('id')
    .single();

  if (error || !season) {
    redirect('/admin/seasons/new?error=' + encodeURIComponent(error?.message ?? 'Failed to create season.'));
  }

  revalidatePath('/admin/seasons');
  redirect(`/admin/seasons/${season.id}`);
}
