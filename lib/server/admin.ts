import { createServiceClient } from '@/lib/supabase/service';

export async function isAdminUser(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

export async function getProfile(userId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, delivery_zone, size_preference, is_admin')
    .eq('id', userId)
    .single();
  return data as {
    id: string;
    delivery_zone: string | null;
    size_preference: string | null;
    is_admin: boolean;
  } | null;
}
