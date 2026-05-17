-- ============================================================
-- MirMari v2 — Phase 7: Messaging (admin ↔ user)
-- Uses support_chats / support_messages to avoid conflict
-- with the v1 'chats' table (dropped in Phase 9).
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.chat_subject AS ENUM ('delivery', 'sizing', 'support', 'general');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── support_chats ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_chats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject    public.chat_subject NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_support_chats"
  ON public.support_chats FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "users_insert_own_support_chats"
  ON public.support_chats FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_update_support_chats"
  ON public.support_chats FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── support_messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID NOT NULL REFERENCES public.support_chats(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id),
  content    TEXT NOT NULL CHECK (char_length(content) > 0),
  is_system  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_support_messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_chats
       WHERE support_chats.id = support_messages.chat_id
         AND (support_chats.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "insert_support_messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_chats
       WHERE support_chats.id = support_messages.chat_id
         AND (support_chats.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ── Trigger: keep support_chats.updated_at current ───────────────────────────
CREATE OR REPLACE FUNCTION public.update_support_chat_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.support_chats SET updated_at = now() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_update_chat_timestamp ON public.support_messages;
CREATE TRIGGER support_messages_update_chat_timestamp
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_support_chat_timestamp();
