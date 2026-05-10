# Pulse — Real-time Social Chat

Modern, Discord-inspired 1:1 messaging platform. Real-time chat, friend system, profiles, replies, read receipts, file & image sharing.

## Stack

- **Frontend**: React 19 + TanStack Start (Vite 7), Tailwind CSS v4, shadcn/ui, framer-motion
- **Backend**: Lovable Cloud (managed Supabase) — Postgres + Realtime + Auth + Storage
- **Realtime**: Supabase Realtime over secure WebSockets (WSS) for `postgres_changes` + broadcast (typing)
- **Storage**: Supabase Storage — `avatars` (public), `attachments` (private, signed URLs)

## Local development

```bash
bun install
bun run dev
```

The `.env` file is auto-managed by Lovable Cloud and contains
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Data model

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Public user profile | `id`, `username` (unique), `display_name`, `avatar_url`, `bio`, `status_message`, `is_online`, `last_seen` |
| `friendships` | Friend graph | `requester_id`, `addressee_id`, `status` (`pending`\|`accepted`) |
| `conversations` | 1:1 conversation pair | `user_a`, `user_b` (sorted), `last_message_at` |
| `messages` | Messages | `conversation_id`, `sender_id`, `content`, `attachment_url` (storage path), `attachment_type/name`, `reply_to_id`, `delivered_at`, `read_at` |
| `typing_indicators` | Legacy DB-based typing | (current build uses Realtime broadcast instead) |

A Postgres trigger (`bump_conversation_timestamp`) keeps `conversations.last_message_at` current.
A Postgres trigger on `auth.users` (`handle_new_user`) provisions the user's profile with a unique username on signup.

## Storage layout

- `avatars/{userId}/avatar-{ts}.{ext}` — **public** bucket; only owner can write/delete.
- `attachments/{userId}/{conversationId}/{ts}.{ext}` — **private** bucket; only **conversation participants** can read (signed URLs, 1h TTL); only the owner can delete.

## Security model

### Row-Level Security (RLS) — enabled on every public table

- `profiles` — readable by any authenticated user; only the owner can update/insert their row.
- `friendships` — visible to both parties; only the requester can `INSERT` (and only with their own id); only the **addressee** can flip `pending → accepted` (prevents self-acceptance escalation); either party may delete (unfriend / cancel).
- `conversations` — visible/insertable/updatable only by the two participants.
- `messages` — readable/insertable only by participants; updatable only by the **recipient** (delivered/read receipts); deletable only by the sender.
- `typing_indicators` — restricted to participants.

### Storage RLS

- `attachments`: SELECT requires the requester to be a participant of the conversation encoded in the path; INSERT requires owner-prefixed path; DELETE requires ownership.
- `avatars`: SELECT public; INSERT/UPDATE/DELETE require ownership.

### Function privileges

`SECURITY DEFINER` helpers (`handle_new_user`, `bump_conversation_timestamp`,
`is_conversation_participant`) have `EXECUTE` revoked from `PUBLIC`, `anon`,
and `authenticated`. They run only as triggers or inside RLS predicates
under the table owner's privileges, never via the PostgREST API.

### Authentication

- Supabase Auth, email + password.
- Passwords hashed with **bcrypt** by Supabase Auth (`auth.users.encrypted_password`); plaintext is never persisted.
- Sessions are JWTs (HS256) issued by Supabase, persisted in `localStorage` and rotated automatically.
- Username uniqueness enforced at the DB level (`profiles.username UNIQUE`) and pre-checked client-side.

### Transport

- All traffic uses **HTTPS** (Lovable preview/published) and Realtime uses **WSS**.

### Encryption status (honest)

- **At rest**: Postgres + Storage encrypted at rest by Supabase (AES-256, managed by the cloud provider).
- **In transit**: TLS for HTTPS and WSS.
- **End-to-end**: ❌ not implemented in v1. Server (and DB admins) can read message content. See "Future work".
- **Calls**: not yet implemented (planned phase 2 — WebRTC peer-to-peer with DTLS-SRTP).

### Other protections

- Strict input validation with `zod` on auth (username allowlist `[a-z0-9_]`, length, reserved-name list; email/password length limits).
- React renders all user-supplied content as text (no `dangerouslySetInnerHTML` on user data) → XSS-safe by default.
- File uploads capped at 10 MB (attachments) / 5 MB (avatars), stored under per-user paths, served as signed URLs for private content.
- Realtime broadcast typing events carry only the sender's user id, not message content.

## Admin access

Admins access stored data via the **Lovable Cloud → Backend** dashboard
(equivalent to the Supabase dashboard for the underlying project): SQL editor,
Auth users, Storage browser, RLS policy editor. There is no in-app admin UI in v1.
Service-role access bypasses RLS and is held only by the platform/owner.

## Is it safe to chat on Pulse?

**Honest answer:** Pulse is suitable for everyday social chat, **not for
secrets or regulated data**. Defenses in place: TLS everywhere, encrypted at
rest, strict RLS preventing other users from reading your messages or
attachments, owner-scoped storage policies, recipient-only read receipts,
bcrypt-hashed passwords, JWT sessions. **Limitations:** no end-to-end
encryption — backend operators (and anyone with service-role access) can
technically read messages; no spam/abuse moderation; no rate limiting beyond
Supabase defaults. Treat it like Discord/Telegram (without secret chats), not
Signal.

## Future work (not in v1)

- End-to-end encryption (Signal-style double ratchet) for messages and attachments.
- Voice/video calls via WebRTC (peer-to-peer DTLS-SRTP) with Supabase Realtime signaling + TURN.
- Background-blur / beauty filters via MediaPipe Selfie Segmentation (in-browser, no backend).
- Rate limiting (per-user message/upload throttles via Edge Functions).
- AI moderation pass on uploads & messages.
- Block / report users.
- Realtime channel authorization (private channels with RLS on `realtime.messages`).
- Push notifications.

## Project structure

```
src/
├── assets/                 logo + brand artwork
├── components/
│   ├── brand/logo.tsx
│   ├── chat/
│   │   ├── chat-layout.tsx
│   │   ├── sidebar.tsx
│   │   ├── conversation-view.tsx
│   │   ├── composer.tsx
│   │   ├── message-bubble.tsx
│   │   ├── attachment-image.tsx
│   │   ├── image-viewer.tsx
│   │   └── empty-state.tsx
│   └── ui/                 shadcn primitives
├── hooks/
│   ├── use-auth.tsx        session + presence heartbeat
│   └── use-signed-url.tsx  cached signed-URL resolver for private storage
├── integrations/supabase/  generated client (do not edit)
├── lib/format.ts           date/last-seen helpers
├── routes/
│   ├── __root.tsx
│   ├── index.tsx           landing
│   ├── auth.tsx            sign in / sign up
│   ├── _app.tsx            auth-gated layout
│   └── _app/
│       ├── chat.tsx
│       └── profile.$username.tsx
├── styles.css              Tailwind v4 tokens (dark, Discord-inspired)
└── types/chat.ts
supabase/
└── migrations/             SQL schema + RLS history
```
