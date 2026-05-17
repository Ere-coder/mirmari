'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult, ChatSubject } from '@/lib/types-v2';

export async function createChat(subject: ChatSubject, firstMessage: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const content = firstMessage.trim();
  if (!content) redirect('/messages/new?error=Message+required');

  const { data: chat, error: chatError } = await supabase
    .from('support_chats')
    .insert({ user_id: user.id, subject })
    .select('id')
    .single();

  if (chatError || !chat) redirect('/messages/new?error=Failed+to+create+conversation');

  await supabase
    .from('support_messages')
    .insert({ chat_id: chat.id, sender_id: user.id, content });

  redirect(`/messages/${chat.id}`);
}

export async function sendMessage(chatId: string, content: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const text = content.trim();
  if (!text) return { success: false, error: 'Message cannot be empty' };

  const { error } = await supabase
    .from('support_messages')
    .insert({ chat_id: chatId, sender_id: user.id, content: text });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/messages/${chatId}`);
  revalidatePath('/messages');
  return { success: true };
}

export async function sendAdminMessage(chatId: string, content: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: p } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!p?.is_admin) return { success: false, error: 'Unauthorized' };

  const text = content.trim();
  if (!text) return { success: false, error: 'Message cannot be empty' };

  const { error } = await supabase
    .from('support_messages')
    .insert({ chat_id: chatId, sender_id: user.id, content: text });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/messages/${chatId}`);
  revalidatePath('/admin/messages');
  return { success: true };
}
