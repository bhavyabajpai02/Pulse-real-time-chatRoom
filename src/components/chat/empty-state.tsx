import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex-1 grid place-items-center bg-gradient-hero">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm px-6"
      >
        <div className="size-16 mx-auto rounded-2xl bg-gradient-primary grid place-items-center shadow-glow mb-5">
          <MessageCircle className="size-8 text-primary-foreground" />
        </div>
        <h2 className="font-display text-2xl font-bold">Your messages</h2>
        <p className="text-muted-foreground mt-2">
          Search for a friend, accept a request, or pick a conversation from the sidebar to start chatting.
        </p>
      </motion.div>
    </div>
  );
}
