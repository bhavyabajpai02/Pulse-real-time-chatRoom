import { createFileRoute } from "@tanstack/react-router";
import { ChatLayout } from "@/components/chat/chat-layout";

export const Route = createFileRoute("/_app/chat")({
  validateSearch: (s: Record<string, unknown>) => ({
    with: typeof s.with === "string" ? s.with : undefined,
  }),
  component: ChatLayout,
});
