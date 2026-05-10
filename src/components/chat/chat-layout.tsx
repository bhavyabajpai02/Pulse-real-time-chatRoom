import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { ConversationView } from "./conversation-view";
import { EmptyState } from "./empty-state";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/types/chat";
import { Menu, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo, LogoSplash } from "@/components/brand/logo";
import { useNavigate, useSearch } from "@tanstack/react-router";

export function ChatLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app/chat" }) as { with?: string };
  const [me, setMe] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeOther, setActiveOther] = useState<Profile | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data, error }) => {
      if (error) setLoadError(error.message);
      else if (data) setMe(data as Profile);
    });
  }, [user]);

  const openConversation = useCallback(async (other: Profile) => {
    if (!user) return;
    const [a, b] = [user.id, other.id].sort();
    const { data: existing } = await supabase
      .from("conversations").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();

    let convId = existing?.id;
    if (!convId) {
      const { data: created, error } = await supabase
        .from("conversations").insert({ user_a: a, user_b: b }).select("id").single();
      if (error) return;
      convId = created.id;
    }
    setActiveConvId(convId);
    setActiveOther(other);
    setMobileSidebarOpen(false);
  }, [user]);

  // Deep-link: /chat?with=username
  useEffect(() => {
    if (!me || !search.with || activeOther?.username === search.with) return;
    let cancelled = false;
    supabase.from("profiles").select("*").eq("username", search.with).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return;
      openConversation(data as Profile);
      navigate({ to: "/chat", search: {}, replace: true });
    });
    return () => { cancelled = true; };
  }, [me, search.with, activeOther?.username, openConversation, navigate]);

  if (loadError) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="size-8 mx-auto text-destructive mb-3" />
          <p className="text-sm text-muted-foreground">Could not load your profile. {loadError}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!me) return <LogoSplash />;

  const sidebarContent = (
    <Sidebar me={me} activeConvId={activeConvId} onOpenConversation={openConversation} />
  );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <aside className="hidden md:flex w-80 border-r border-border bg-sidebar flex-col">
        {sidebarContent}
      </aside>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="p-0 w-[88%] max-w-sm bg-sidebar border-border">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col min-w-0">
        {activeConvId && activeOther ? (
          <ConversationView
            key={activeConvId}
            conversationId={activeConvId}
            me={me}
            other={activeOther}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        ) : (
          <div className="flex-1 flex flex-col">
            <header className="md:hidden flex items-center justify-between gap-2 p-3 border-b border-border">
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon"><Menu className="size-5" /></Button>
                </SheetTrigger>
              </Sheet>
              <Logo variant="full" size="sm" />
              <span className="size-9" />
            </header>
            <EmptyState />
          </div>
        )}
      </main>
    </div>
  );
}
