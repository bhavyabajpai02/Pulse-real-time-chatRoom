import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile, Friendship } from "@/types/chat";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, Loader2, MessageCircle, UserPlus, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { formatLastSeen } from "@/lib/format";

export const Route = createFileRoute("/_app/profile/$username")({
  component: ProfilePage,
});

type FriendStatus = "self" | "friends" | "pending-out" | "pending-in" | "none";

function ProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reloadFriendship = useCallback(async (otherId: string) => {
    if (!user) return;
    const { data: f } = await supabase
      .from("friendships")
      .select("*")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`)
      .maybeSingle();
    setFriendship((f as Friendship) || null);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    supabase.from("profiles").select("*").eq("username", username).maybeSingle().then(async ({ data }) => {
      if (data) {
        const p = data as Profile;
        setProfile(p);
        setDisplayName(p.display_name || "");
        setBio(p.bio || "");
        setStatus(p.status_message || "");

        // Friend count: accepted friendships where user is either side
        const { count } = await supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .or(`requester_id.eq.${p.id},addressee_id.eq.${p.id}`)
          .eq("status", "accepted");
        setFriendCount(count || 0);

        if (user && user.id !== p.id) await reloadFriendship(p.id);
      }
      setLoading(false);
    });
  }, [username, user, reloadFriendship]);

  // Realtime: keep presence + last_seen live
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`profile:${profile.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        (payload) => setProfile(payload.new as Profile))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  const isMe = user?.id === profile?.id;

  const friendStatus: FriendStatus = !user || !profile ? "none"
    : isMe ? "self"
    : !friendship ? "none"
    : friendship.status === "accepted" ? "friends"
    : friendship.requester_id === user.id ? "pending-out" : "pending-in";

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      status_message: status.trim() || null,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated"); setEditing(false); setProfile({ ...profile, display_name: displayName, bio, status_message: status }); }
  };

  const uploadAvatar = async (f: File) => {
    if (!profile) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5MB)"); return; }
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, f, { upsert: true, contentType: f.type });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", profile.id);
    setProfile({ ...profile, avatar_url: data.publicUrl });
    toast.success("Avatar updated");
  };

  const sendRequest = async () => {
    if (!user || !profile) return;
    setActing(true);
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: profile.id });
    setActing(false);
    if (error) toast.error(error.message.includes("duplicate") ? "Request already sent" : error.message);
    else { toast.success(`Request sent to @${profile.username}`); reloadFriendship(profile.id); }
  };
  const acceptRequest = async () => {
    if (!friendship) return;
    setActing(true);
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendship.id);
    setActing(false);
    if (error) toast.error(error.message);
    else { toast.success("Friend added"); if (profile) reloadFriendship(profile.id); }
  };
  const removeFriend = async () => {
    if (!friendship) return;
    setActing(true);
    const { error } = await supabase.from("friendships").delete().eq("id", friendship.id);
    setActing(false);
    if (error) toast.error(error.message);
    else { setFriendship(null); toast.success("Removed"); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  if (!profile) return (
    <div className="min-h-screen grid place-items-center text-center">
      <div>
        <p className="text-muted-foreground mb-3">User @{username} not found</p>
        <Button variant="outline" onClick={() => navigate({ to: "/chat" })}>Back to chat</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" onClick={() => navigate({ to: "/chat" })} className="mb-4">
          <ArrowLeft className="size-4 mr-2" /> Back to chat
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 sm:p-8 shadow-elegant"
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div className="relative">
              <Avatar className="size-24 ring-4 ring-primary/30">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-primary text-primary-foreground text-3xl font-semibold">
                  {profile.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isMe && (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute bottom-0 right-0 size-8 rounded-full bg-gradient-primary grid place-items-center shadow-glow hover:opacity-90"
                    aria-label="Change avatar"
                  >
                    <Camera className="size-4 text-primary-foreground" />
                  </button>
                  <input
                    ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
                  />
                </>
              )}
              {profile.is_online && (
                <span className="absolute top-1 right-1 size-4 rounded-full bg-success ring-4 ring-card" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl font-bold truncate">{profile.display_name || profile.username}</h1>
              <p className="text-muted-foreground">@{profile.username}</p>
              <p className="text-xs mt-1 inline-flex items-center gap-1.5 text-muted-foreground">
                {profile.is_online ? <span className="text-success font-medium">● Online now</span>
                  : <><Clock className="size-3" /> {formatLastSeen(profile.last_seen, false)}</>}
              </p>

              <div className="mt-3 flex items-center gap-3 justify-center sm:justify-start text-sm">
                <div>
                  <span className="font-semibold">{friendCount}</span>{" "}
                  <span className="text-muted-foreground">{friendCount === 1 ? "friend" : "friends"}</span>
                </div>
              </div>

              {!isMe && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
                  {friendStatus === "friends" && (
                    <>
                      <Button asChild className="bg-gradient-primary hover:opacity-90 shadow-glow">
                        <Link to="/chat" search={{ with: profile.username }}>
                          <MessageCircle className="size-4 mr-2" /> Message
                        </Link>
                      </Button>
                      <Button variant="outline" onClick={removeFriend} disabled={acting}>Unfriend</Button>
                    </>
                  )}
                  {friendStatus === "pending-out" && (
                    <Button variant="outline" disabled><Clock className="size-4 mr-2" /> Request sent</Button>
                  )}
                  {friendStatus === "pending-in" && (
                    <>
                      <Button onClick={acceptRequest} disabled={acting} className="bg-gradient-primary hover:opacity-90">
                        <UserCheck className="size-4 mr-2" /> Accept
                      </Button>
                      <Button variant="outline" onClick={removeFriend} disabled={acting}>Decline</Button>
                    </>
                  )}
                  {friendStatus === "none" && (
                    <Button onClick={sendRequest} disabled={acting} className="bg-gradient-primary hover:opacity-90 shadow-glow">
                      <UserPlus className="size-4 mr-2" /> Add friend
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {!editing ? (
            <div className="mt-6 space-y-4">
              {profile.status_message && (
                <div className="rounded-lg bg-muted/40 px-4 py-3 italic text-sm">"{profile.status_message}"</div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-1">About</h3>
                <p className="text-sm">{profile.bio || (isMe ? "Add a bio to tell people about yourself." : "No bio yet.")}</p>
              </div>
              {isMe && (
                <Button onClick={() => setEditing(true)} className="bg-gradient-primary hover:opacity-90">Edit profile</Button>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={100} placeholder="What are you up to?" />
              </div>
              <div className="space-y-1.5">
                <Label>Bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} placeholder="Tell people about yourself..." />
              </div>
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving} className="bg-gradient-primary hover:opacity-90">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
