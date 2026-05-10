import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message, Profile } from "@/types/chat";
import { MessageBubble } from "./message-bubble";
import { Composer } from "./composer";
import { ImageViewer } from "./image-viewer";
import { UserAvatar } from "./sidebar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, isYesterday } from "date-fns";
import { formatLastSeen } from "@/lib/format";

interface Props {
  conversationId: string;
  me: Profile;
  other: Profile;
  onOpenSidebar: () => void;
}

export function ConversationView({ conversationId, me, other, onOpenSidebar }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherProfile, setOtherProfile] = useState<Profile>(other);
  const [otherTyping, setOtherTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<{ src: string; name?: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Reset when conversation changes
  useEffect(() => {
    setOtherProfile(other);
  }, [other]);

  // Load history
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMessages(data as Message[]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Realtime channel: messages, typing broadcast, peer profile updates
  useEffect(() => {
    const channel = supabase
      .channel(`conv:${conversationId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map(x => (x.id === m.id ? m : x)));
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter(x => x.id !== old.id));
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${other.id}` },
        (payload) => setOtherProfile(payload.new as Profile))
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload as { payload?: { from?: string } }).payload?.from !== other.id) return;
        setOtherTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3500);
      })
      .on("broadcast", { event: "stop-typing" }, (payload) => {
        if ((payload as { payload?: { from?: string } }).payload?.from !== other.id) return;
        setOtherTyping(false);
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, other.id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, otherTyping]);

  // Mark received messages delivered + read
  useEffect(() => {
    const undelivered = messages.filter(m => m.sender_id === other.id && !m.delivered_at);
    const unread = messages.filter(m => m.sender_id === other.id && !m.read_at);
    const now = new Date().toISOString();
    if (undelivered.length) {
      supabase.from("messages").update({ delivered_at: now }).in("id", undelivered.map(m => m.id)).then(() => {});
    }
    if (unread.length && document.visibilityState === "visible") {
      supabase.from("messages").update({ read_at: now, delivered_at: now }).in("id", unread.map(m => m.id)).then(() => {});
    }
  }, [messages, other.id]);

  // Refresh receipts when window regains focus
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const unread = messages.filter(m => m.sender_id === other.id && !m.read_at);
      if (!unread.length) return;
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread.map(m => m.id)).then(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [messages, other.id]);

  const sendTyping = useCallback((kind: "typing" | "stop-typing") => {
    channelRef.current?.send({ type: "broadcast", event: kind, payload: { from: me.id } });
  }, [me.id]);

  const jumpToMessage = useCallback((id: string) => {
    const el = messagesRef.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("reply-flash");
    setTimeout(() => el.classList.remove("reply-flash"), 1700);
  }, []);

  const grouped = useMemo(() => {
    return messages.reduce<{ date: string; items: Message[] }[]>((acc, m) => {
      const d = new Date(m.created_at);
      const key = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
      const last = acc[acc.length - 1];
      if (last && last.date === key) last.items.push(m);
      else acc.push({ date: key, items: [m] });
      return acc;
    }, []);
  }, [messages]);

  const messageById = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages]);

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/40 backdrop-blur">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenSidebar}>
          <Menu className="size-5" />
        </Button>
        <Link
          to="/profile/$username"
          params={{ username: otherProfile.username }}
          className="flex items-center gap-3 flex-1 min-w-0 group"
        >
          <UserAvatar profile={otherProfile} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate group-hover:text-primary transition">
              {otherProfile.display_name || otherProfile.username}
            </div>
            <div className="text-xs truncate">
              {otherTyping ? (
                <span className="text-primary inline-flex items-center gap-1.5">
                  <span className="inline-flex gap-0.5">
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                  </span>
                  typing…
                </span>
              ) : (
                <span className="text-muted-foreground">{formatLastSeen(otherProfile.last_seen, otherProfile.is_online)}</span>
              )}
            </div>
          </div>
        </Link>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-6 space-y-4">
        {grouped.map((g) => (
          <div key={g.date} className="space-y-1">
            <div className="text-center my-4">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-1 rounded-full">
                {g.date}
              </span>
            </div>
            {g.items.map((m, i) => {
              const prev = g.items[i - 1];
              const isGrouped =
                !!prev && prev.sender_id === m.sender_id &&
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000 &&
                !m.reply_to_id;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMe={m.sender_id === me.id}
                  other={otherProfile}
                  me={me}
                  grouped={isGrouped}
                  replyTarget={m.reply_to_id ? messageById.get(m.reply_to_id) || null : null}
                  onReply={() => setReplyTo(m)}
                  onJumpToReply={(id) => jumpToMessage(id)}
                  onOpenImage={(src, name) => setViewer({ src, name })}
                  registerRef={(el) => {
                    if (el) messagesRef.current.set(m.id, el);
                    else messagesRef.current.delete(m.id);
                  }}
                />
              );
            })}
          </div>
        ))}
        <AnimatePresence>
          {otherTyping && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-end gap-2 px-2"
            >
              <UserAvatar profile={otherProfile} size="sm" />
              <div className="bubble-them rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Composer
        conversationId={conversationId}
        me={me}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onTyping={sendTyping}
      />

      <ImageViewer src={viewer?.src ?? null} name={viewer?.name} onClose={() => setViewer(null)} />
    </div>
  );
}
