
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  status_message TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')
);

CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_online ON public.profiles(is_online, last_seen DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Friendships table (single row per pair, lower id first)
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted');

CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own friendships"
  ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Addressee can update (accept) requests; either party can update"
  ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id OR auth.uid() = requester_id);

CREATE POLICY "Either party can delete (unfriend / cancel)"
  ON public.friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Conversations (1:1)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX idx_conversations_users ON public.conversations(user_a, user_b);
CREATE INDEX idx_conversations_last_msg ON public.conversations(last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Participants can create conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Participants can update conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  attachment_name TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (content IS NOT NULL OR attachment_url IS NOT NULL)
);

CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper: is participant of conversation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conv_id AND (user_a = _user_id OR user_b = _user_id)
  );
$$;

CREATE POLICY "Participants can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "Recipients can mark read; senders can edit"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Senders can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- Trigger: bump conversation last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_timestamp();

-- Typing indicators (ephemeral, broadcast via realtime)
CREATE TABLE public.typing_indicators (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read typing"
  ON public.typing_indicators FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can upsert own typing"
  ON public.typing_indicators FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can update own typing"
  ON public.typing_indicators FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own typing"
  ON public.typing_indicators FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'))
  );
  IF base_username IS NULL OR length(base_username) < 3 THEN
    base_username := 'user' || substr(NEW.id::text, 1, 8);
  END IF;
  base_username := substring(base_username, 1, 20);
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := substring(base_username, 1, 17) || counter::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final_username, COALESCE(NEW.raw_user_meta_data->>'display_name', final_username));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Attachments are readable to authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "Users can upload attachments to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Suabase ai querries- which resolved the fail send mesg issue
-- Swap any rows that violate canonical ordering
-- UPDATE public.conversations
-- SET
--   user_a = LEAST(user_a, user_b),
--   user_b = GREATEST(user_a, user_b)
-- WHERE user_a > user_b;

-- -- 0.2 Re-create the constraint
-- ALTER TABLE public.conversations
-- ADD CONSTRAINT conversations_check CHECK (user_a < user_b);

-- -- 1.1 Add a trigger to always set sender_id = auth.uid()
-- CREATE OR REPLACE FUNCTION public.messages_set_sender_id()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   NEW.sender_id := auth.uid();
--   RETURN NEW;
-- END;
-- $$;

-- DROP TRIGGER IF EXISTS trg_messages_set_sender_id ON public.messages;

-- CREATE TRIGGER trg_messages_set_sender_id
-- BEFORE INSERT ON public.messages
-- FOR EACH ROW
-- EXECUTE FUNCTION public.messages_set_sender_id();
-- -- 1.2 (Optional but recommended) remove the “sender_id must equal auth.uid()” check from INSERT policy

-- -- 2) Block empty messages at the DB level (security + correctness)
-- ALTER TABLE public.messages
-- DROP CONSTRAINT IF EXISTS messages_content_or_attachment_check;

-- ALTER TABLE public.messages
-- ADD CONSTRAINT messages_content_or_attachment_check
-- CHECK (
--   (content IS NOT NULL AND btrim(content) <> '')
--   OR attachment_url IS NOT NULL
-- );


-- -- 3) Secure messages RLS properly (read + insert)
-- -- 3.1 Ensure RLS is ON
-- ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- -- 3.2 Drop any broken/competing policies
-- DROP POLICY IF EXISTS "messages_select" ON public.messages;
-- DROP POLICY IF EXISTS "messages_insert" ON public.messages;
-- DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
-- DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
-- DROP POLICY IF EXISTS "Recipients can mark read; senders can edit" ON public.messages;
-- DROP POLICY IF EXISTS "Senders can delete own messages" ON public.messages;

-- -- 3.3 Create a robust SELECT policy (participants can read)
-- CREATE POLICY "messages_select_participants"
-- ON public.messages
-- FOR SELECT
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- );

-- -- 3.4 Create a robust INSERT policy (participants can send)
-- CREATE POLICY "messages_insert_participants"
-- ON public.messages
-- FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- );

-- -- 4) (Recommended) Add UPDATE/DELETE policies so chat keeps working
-- -- UPDATE: allow participants to update (tighten further if you want)
-- CREATE POLICY "messages_update_participants"
-- ON public.messages
-- FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- );

-- -- DELETE: allow only the sender (prevents removing other people’s messages)
-- C-- UPDATE: allow participants to update (tighten further if you want)
-- CREATE POLICY "messages_update_participants"
-- ON public.messages
-- FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- );

-- -- DELETE: allow only the sender (prevents removing other people’s messages)
-- -- UPDATE: allow participants to update (tighten further if you want)
-- CREATE POLICY "messages_update_participants"
-- ON public.messages
-- FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- );

-- -- DELETE: allow only the sender (prevents removing other people’s messages)
-- -- UPDATE: allow participants to update (tighten further if you want)
-- CREATE POLICY "messages_update_participants"
-- ON public.messages
-- FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = public.messages.conversation_id
--       AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
--   )
-- );
-- CREATE POLICY "messages_delete_sender"
-- ON public.messages
-- FOR DELETE
-- TO authenticated
-- USING (sender_id = auth.uid());

-- --5) Restore realtime functionality (usually already fine, but verify) 
-- -- Check publication membership (view results)
-- SELECT *
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
-- -- If public.messages or public.conversations are missing, add them back:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- -- 6) One more common cause of 403: missing table grants
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;