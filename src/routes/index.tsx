import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Users, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Logo } from "@/components/brand/logo";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/chat" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto w-full">
        <Logo variant="full" size="md" asLink />
        <div className="flex items-center gap-3">
          <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/auth" search={{ mode: "signup" }}><Button className="bg-gradient-primary hover:opacity-90 shadow-glow">Get started</Button></Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground mb-8 backdrop-blur"
          >
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            Real-time messaging, built for instant connection
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]"
          >
            Find your people. <br />
            <span className="text-gradient">Chat in real time.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Pulse is a modern social messenger. Pick a unique username, discover friends,
            and exchange messages, photos, and emoji — instantly.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex items-center justify-center gap-3"
          >
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-base h-12 px-8">
                Create your account
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="h-12 px-8">Sign in</Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6"
          >
            {[
              { icon: Zap, title: "Instant messaging", desc: "Powered by realtime sync." },
              { icon: Users, title: "Friend system", desc: "Send requests, build your circle." },
              { icon: Shield, title: "Private by default", desc: "Row-level security, end-to-end auth." },
            ].map((f, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card/40 backdrop-blur p-6 text-left">
                <f.icon className="size-5 text-primary mb-3" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
