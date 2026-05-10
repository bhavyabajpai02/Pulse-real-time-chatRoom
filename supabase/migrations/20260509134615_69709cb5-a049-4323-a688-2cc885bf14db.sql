
-- Revoke broad EXECUTE on SECURITY DEFINER functions; trigger context still works.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) FROM PUBLIC, anon;
-- is_conversation_participant is used inside RLS policies which run as the policy owner; keep it callable by authenticated for direct use too:
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;

-- Prevent listing the entire bucket: require name to be non-empty and limit reads
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars readable by path"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND name IS NOT NULL);

DROP POLICY IF EXISTS "Attachments are readable to authenticated" ON storage.objects;
CREATE POLICY "Attachments readable by participants of folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND name IS NOT NULL);
