import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile, Friendship } from "@/types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, LogOut, Settings, UserPlus, Check, X, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/brand/logo";
import { formatLastSeen } from "@/lib/format";

interface Props {
  me: Profile;
  activeConvId: string | null;
  onOpenConversation: (other: Profile) => void;
}

export function Sidebar({ me, onOpenConversation }: Props) {
  const { signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [pending, setPending] = useState<{ friendship: Friendship; profile: Profile }[]>([]);
  const [outgoing, setOutgoing] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<Profile[]>([]);

  // Search profiles
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", me.id)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(15);
      setSearchResults((data as Profile[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, me.id]);

  const loadFriendships = async () => {
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${me.id},addressee_id.eq.${me.id}`);
    if (!data) return;
    const friendships = data as Friendship[];

    const accepted = friendships.filter(f => f.status === "accepted");
    const pendingIn = friendships.filter(f => f.status === "pending" && f.addressee_id === me.id);
    const pendingOut = friendships.filter(f => f.status === "pending" && f.requester_id === me.id);
    setOutgoing(new Set(pendingOut.map(f => f.addressee_id)));

    const friendIds = accepted.map(f => f.requester_id === me.id ? f.addressee_id : f.requester_id);
    const requesterIds = pendingIn.map(f => f.requester_id);
    const allIds = [...new Set([...friendIds, ...requesterIds])];

    if (allIds.length === 0) { setFriends([]); setPending([]); return; }

    const { data: profiles } = await supabase.from("profiles").select("*").in("id", allIds);
    const pmap = new Map((profiles || []).map(p => [p.id, p as Profile]));

    setFriends(friendIds.map(id => pmap.get(id)).filter(Boolean) as Profile[]);
    setPending(pendingIn.map(f => ({ friendship: f, profile: pmap.get(f.requester_id)! })).filter(x => x.profile));
  };

  const loadOnline = async () => {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", me.id)
      .eq("is_online", true)
      .gte("last_seen", cutoff)
      .order("last_seen", { ascending: false })
      .limit(20);
    setOnlineUsers((data as Profile[]) || []);
  };

  useEffect(() => {
    loadFriendships();
    loadOnline();

    const channel = supabase
      .channel("sidebar-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadFriendships())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => loadOnline())
      .subscribe();

    const interval = setInterval(loadOnline, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const sendRequest = async (other: Profile) => {
    const { error } = await supabase.from("friendships").insert({ requester_id: me.id, addressee_id: other.id });
    if (error) toast.error(error.message.includes("duplicate") ? "Request already exists" : error.message);
    else { toast.success(`Request sent to @${other.username}`); loadFriendships(); }
  };

  const acceptRequest = async (f: Friendship) => {
    const { error } = await supabase.from("friendships").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", f.id);
    if (error) toast.error(error.message); else loadFriendships();
  };

  const rejectRequest = async (f: Friendship) => {
    const { error } = await supabase.from("friendships").delete().eq("id", f.id);
    if (error) toast.error(error.message); else loadFriendships();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Brand + current user */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="mb-3">
          <Logo variant="full" size="sm" asLink />
        </div>
        <div className="flex items-center gap-3">
          <Link to="/profile/$username" params={{ username: me.username }} className="flex items-center gap-3 group flex-1 min-w-0">
            <Avatar className="size-10 ring-2 ring-primary/30">
              <AvatarImage src={me.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-primary text-primary-foreground font-semibold">
                {me.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate group-hover:text-primary transition">{me.display_name || me.username}</div>
              <div className="text-xs text-muted-foreground truncate">@{me.username}</div>
            </div>
          </Link>
          <Button variant="ghost" size="icon" asChild aria-label="Open profile">
            <Link to="/profile/$username" params={{ username: me.username }}>
              <Settings className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-border"
          />
        </div>
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 space-y-1 max-h-72 overflow-y-auto"
            >
              {searchResults.map((p) => {
                const isFriend = friends.some(f => f.id === p.id);
                const isOutgoing = outgoing.has(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50">
                    <UserAvatar profile={p} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.display_name || p.username}</div>
                      <div className="text-xs text-muted-foreground truncate">@{p.username}</div>
                    </div>
                    {isFriend ? (
                      <Button size="sm" variant="ghost" onClick={() => onOpenConversation(p)}>Chat</Button>
                    ) : isOutgoing ? (
                      <Badge variant="secondary" className="text-xs">Pending</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => sendRequest(p)}>
                        <UserPlus className="size-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tabs: Friends / Requests / Online */}
      <Tabs defaultValue="friends" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none bg-transparent border-b border-border h-10 px-2">
          <TabsTrigger value="friends" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            Friends {friends.length > 0 && <span className="ml-1 text-xs opacity-70">{friends.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="requests" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            Requests {pending.length > 0 && <Badge className="ml-1 h-4 px-1 bg-primary text-primary-foreground text-[10px]">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="online" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            Online
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="flex-1 overflow-y-auto p-2 m-0">
          {friends.length === 0 ? (
            <EmptyList icon={<Users className="size-6" />} text="No friends yet. Search to find people!" />
          ) : (
            friends.map(f => (
              <UserRow key={f.id} profile={f} onClick={() => onOpenConversation(f)} />
            ))
          )}
        </TabsContent>

        <TabsContent value="requests" className="flex-1 overflow-y-auto p-2 m-0">
          {pending.length === 0 ? (
            <EmptyList icon={<UserPlus className="size-6" />} text="No pending requests." />
          ) : (
            pending.map(({ friendship, profile }) => (
              <div key={friendship.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/40">
                <UserAvatar profile={profile} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{profile.display_name || profile.username}</div>
                  <div className="text-xs text-muted-foreground truncate">@{profile.username}</div>
                </div>
                <Button size="icon" variant="ghost" className="size-8 text-success hover:text-success hover:bg-success/10" onClick={() => acceptRequest(friendship)}>
                  <Check className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => rejectRequest(friendship)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="online" className="flex-1 overflow-y-auto p-2 m-0">
          {onlineUsers.length === 0 ? (
            <EmptyList icon={<Users className="size-6" />} text="No one online right now." />
          ) : (
            onlineUsers.map(p => (
              <UserRow key={p.id} profile={p} onClick={() => onOpenConversation(p)} />
            ))
          )}
        </TabsContent>
      </Tabs>

      <div className="p-3 border-t border-border">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={signOut}>
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function UserRow({ profile, onClick }: { profile: Profile; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition text-left">
      <UserAvatar profile={profile} size="md" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{profile.display_name || profile.username}</div>
        <div className="text-xs text-muted-foreground truncate">
          {profile.is_online ? <span className="text-success">● Online</span> : formatLastSeen(profile.last_seen, false)}
        </div>
      </div>
    </button>
  );
}

export function UserAvatar({ profile, size = "md" }: { profile: Profile; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "size-8" : size === "lg" ? "size-14" : "size-10";
  return (
    <div className="relative">
      <Avatar className={sz}>
        <AvatarImage src={profile.avatar_url || undefined} />
        <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
          {profile.username[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {profile.is_online && (
        <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-sidebar" />
      )}
    </div>
  );
}

function EmptyList({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center text-muted-foreground py-12 px-4">
      <div className="mx-auto mb-3 opacity-40">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
