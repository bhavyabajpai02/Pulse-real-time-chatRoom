import type { Message, Profile } from "@/types/chat";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Check, CheckCheck, Trash2, Download, Reply, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AttachmentImage } from "./attachment-image";
import { useSignedAttachmentUrl } from "@/hooks/use-signed-url";

interface Props {
  message: Message;
  isMe: boolean;
  other: Profile;
  me: Profile;
  grouped: boolean;
  replyTarget: Message | null;
  onReply: () => void;
  onJumpToReply: (id: string) => void;
  onOpenImage: (src: string, name?: string | null) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

export function MessageBubble({
  message, isMe, grouped, replyTarget, onReply, onJumpToReply, onOpenImage, registerRef,
}: Props) {
  const [hover, setHover] = useState(false);
  const isImage = message.attachment_type?.startsWith("image/");
  const fileUrl = useSignedAttachmentUrl(!isImage ? message.attachment_url : null);

  const handleDelete = async () => {
    await supabase.from("messages").delete().eq("id", message.id);
  };

  const ReceiptTick = () => {
    if (!isMe) return null;
    if (message.read_at) return <CheckCheck className="size-3.5 text-tick-read" />;
    if (message.delivered_at) return <CheckCheck className="size-3.5 opacity-80" />;
    return <Check className="size-3.5 opacity-80" />;
  };

  return (
    <motion.div
      ref={registerRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex ${isMe ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-3"} px-1 rounded-md`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className={`group flex items-end gap-2 max-w-[85%] sm:max-w-[78%] ${isMe ? "flex-row-reverse" : ""}`}>
        <div
          className={`relative rounded-2xl px-3 py-2 shadow-sm ${
            isMe ? "bubble-me text-primary-foreground" : "bubble-them text-foreground"
          } ${
            isMe ? (grouped ? "rounded-tr-md" : "") : (grouped ? "rounded-tl-md" : "")
          }`}
        >
          {replyTarget && (
            <button
              type="button"
              onClick={() => onJumpToReply(replyTarget.id)}
              className={`flex items-start gap-2 mb-1.5 px-2 py-1 rounded-md text-left w-full hover:bg-black/10 transition border-l-2 ${
                isMe ? "border-white/60 bg-black/15" : "border-primary bg-primary/10"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium ${isMe ? "text-white/90" : "text-primary"}`}>
                  {replyTarget.sender_id === message.sender_id ? "You" : "Reply"}
                </div>
                <div className={`text-xs truncate ${isMe ? "text-white/80" : "text-muted-foreground"}`}>
                  {replyTarget.content || (replyTarget.attachment_type?.startsWith("image/") ? "📷 Photo" : replyTarget.attachment_name || "Attachment")}
                </div>
              </div>
            </button>
          )}

          {message.attachment_url && isImage && (
            <AttachmentImage
              path={message.attachment_url}
              name={message.attachment_name}
              onClick={(url) => onOpenImage(url, message.attachment_name)}
              className="mb-1"
            />
          )}
          {message.attachment_url && !isImage && (
            <a
              href={fileUrl || "#"}
              target="_blank"
              rel="noreferrer"
              download={message.attachment_name || true}
              className={`flex items-center gap-2 text-sm underline-offset-2 hover:underline mb-1 ${!fileUrl ? "pointer-events-none opacity-60" : ""}`}
            >
              <Download className="size-4" />
              <span className="truncate max-w-[200px]">{message.attachment_name || "file"}</span>
            </a>
          )}
          {!message.content && !message.attachment_url && (
            <span className="text-xs italic opacity-70 inline-flex items-center gap-1">
              <ImageIcon className="size-3" /> empty
            </span>
          )}
          {message.content && <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>}

          <div className={`flex items-center gap-1 mt-0.5 text-[10px] ${isMe ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            <span>{format(new Date(message.created_at), "p")}</span>
            <ReceiptTick />
          </div>
        </div>

        {/* Hover actions */}
        {hover && (
          <div className={`flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition ${isMe ? "items-end" : "items-start"}`}>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-primary"
              onClick={onReply}
              aria-label="Reply"
            >
              <Reply className="size-3.5" />
            </Button>
            {isMe && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                aria-label="Delete message"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
