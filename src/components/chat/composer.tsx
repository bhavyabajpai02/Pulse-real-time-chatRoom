import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile, Paperclip, Send, Loader2, X, Image as ImageIcon, Reply } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Message, Profile } from "@/types/chat";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  conversationId: string;
  me: Profile;
  replyTo: Message | null;
  onClearReply: () => void;
  onTyping: (kind: "typing" | "stop-typing") => void;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function Composer({ conversationId, me, replyTo, onClearReply, onTyping }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Focus textarea when starting a reply
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Cleanup preview URL
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Stop typing on unmount / conv switch
  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping("stop-typing");
    }
  }, [conversationId, onTyping]);

  const triggerTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping("typing");
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping("stop-typing");
    }, 2500);
  }, [onTyping]);

  const handleFile = (f: File) => {
    if (f.size > MAX_BYTES) { toast.error("File too large (max 10MB)"); return; }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (!item) return;
    const f = item.getAsFile();
    if (f) {
      e.preventDefault();
      const renamed = new File([f], f.name || `pasted-${Date.now()}.png`, { type: f.type });
      handleFile(renamed);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const send = async () => {
    const content = text.trim();
    if (!content && !file) return;
    setSending(true);
    try {
      let attachment_url: string | null = null;
      let attachment_type: string | null = null;
      let attachment_name: string | null = null;

      if (file) {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 6);
        const path = `${me.id}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type,
        });
        if (upErr) throw upErr;
        attachment_url = path; // store storage path; resolved to signed URL on display
        attachment_type = file.type;
        attachment_name = file.name;
      }

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: me.id,
        content: content || null,
        attachment_url, attachment_type, attachment_name,
        reply_to_id: replyTo?.id ?? null,
      });
      if (error) throw error;

      setText("");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      onClearReply();
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping("stop-typing");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape" && replyTo) {
      onClearReply();
    }
  };

  const replyPreviewText = replyTo
    ? (replyTo.content || (replyTo.attachment_type?.startsWith("image/") ? "Photo" : replyTo.attachment_name || "Attachment"))
    : "";

  return (
    <div
      className={`relative border-t border-border bg-card/40 backdrop-blur p-3 transition ${dragOver ? "drop-ring" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 grid place-items-center bg-primary/10 border-2 border-dashed border-primary rounded-md pointer-events-none"
          >
            <span className="text-sm font-medium text-primary">Drop to attach</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-2"
          >
            <div className="flex items-start gap-2 bg-muted/40 border-l-2 border-primary rounded-md px-3 py-2">
              <Reply className="size-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-primary">
                  Replying to {replyTo.sender_id === me.id ? "yourself" : "message"}
                </div>
                <div className="text-xs text-muted-foreground truncate">{replyPreviewText}</div>
              </div>
              <Button size="icon" variant="ghost" className="size-6" onClick={onClearReply}>
                <X className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {file && (
        <div className="mb-2 flex items-center gap-3 bg-muted/50 rounded-lg p-2">
          {preview ? (
            <img src={preview} alt="preview" className="size-14 object-cover rounded" />
          ) : (
            <div className="size-14 rounded bg-muted grid place-items-center"><ImageIcon className="size-5" /></div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); }}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-primary shrink-0" aria-label="Attach file">
          <Paperclip className="size-5" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary shrink-0" aria-label="Insert emoji">
              <Smile className="size-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="p-0 border-border w-auto">
            <EmojiPicker
              theme={Theme.DARK}
              onEmojiClick={(d) => setText((t) => t + d.emoji)}
              width={320} height={380} lazyLoadEmojis
            />
          </PopoverContent>
        </Popover>

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); triggerTyping(); }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={replyTo ? "Reply…" : "Message…"}
          rows={1}
          className="resize-none min-h-[42px] max-h-32 bg-muted/50 border-border focus-visible:ring-primary"
        />

        <Button
          onClick={send}
          disabled={sending || (!text.trim() && !file)}
          className="bg-gradient-primary hover:opacity-90 shadow-glow size-10 p-0 shrink-0"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
