export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  status_message: string | null;
  is_online: boolean;
  last_seen: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  reply_to_id: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  created_at: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
  updated_at: string;
}
