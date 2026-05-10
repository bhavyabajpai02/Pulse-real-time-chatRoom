-- 1. Storage: make attachments private + scoped read/delete
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

DROP POLICY IF EXISTS "Attachments readable by participants of folder" ON storage.objects;

CREATE POLICY "Attachments readable by conversation participants"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attachments'
  AND public.is_conversation_participant(
    ((storage.foldername(name))[2])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Owner can delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Friendships: prevent self-acceptance
DROP POLICY IF EXISTS "Addressee can update (accept) requests; either party can update" ON public.friendships;

CREATE POLICY "Addressee can accept pending requests"
ON public.friendships FOR UPDATE TO authenticated
USING (auth.uid() = addressee_id AND status = 'pending')
WITH CHECK (auth.uid() = addressee_id AND status = 'accepted');

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from clients (they're trigger / RLS-internal helpers)
REVOKE EXECUTE ON FUNCTION public.bump_conversation_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Messages: replies + delivered receipts
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_id);

-- Tighten message UPDATE: only recipient can mark delivered/read; sender keeps no edit ability for now
DROP POLICY IF EXISTS "Recipients can mark read; senders can edit" ON public.messages;

CREATE POLICY "Recipients can mark delivered/read"
ON public.messages FOR UPDATE TO authenticated
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
  AND sender_id <> auth.uid()
)
WITH CHECK (
  public.is_conversation_participant(conversation_id, auth.uid())
  AND sender_id <> auth.uid()
);
