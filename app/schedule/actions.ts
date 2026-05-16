'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types-v2';

export type BookResult =
  | { success: true; reservationId: string; weekStart: string }
  | { success: false; error: string };

export async function bookNextAvailableWeek(setId: string): Promise<BookResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('book_next_available_week', {
    p_outfit_set_id: setId,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; reservation_id?: string; week_start?: string; error?: string };
  if (!result.success) return { success: false, error: result.error ?? 'Booking failed' };

  revalidatePath('/schedule');
  revalidatePath('/wardrobe');
  return { success: true, reservationId: result.reservation_id!, weekStart: result.week_start! };
}

export async function cancelReservation(
  reservationId: string
): Promise<ActionResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('cancel_reservation', {
    p_reservation_id: reservationId,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string };
  if (!result.success) return { success: false, error: result.error ?? 'Cancel failed' };

  revalidatePath('/schedule');
  revalidatePath('/wardrobe');
  return { success: true };
}
