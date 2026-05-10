import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();
const TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Resolve a private storage path to a short-lived signed URL.
 * Accepts either a storage path ("attachments/userId/conv/file.jpg" or "userId/conv/file.jpg")
 * or a full http(s) URL (returned as-is, used for legacy public URLs).
 */
export function useSignedAttachmentUrl(pathOrUrl: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pathOrUrl) {
      setUrl(null);
      return;
    }
    if (/^https?:\/\//.test(pathOrUrl)) {
      setUrl(pathOrUrl);
      return;
    }
    const path = pathOrUrl.replace(/^attachments\//, "");
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("attachments")
      .createSignedUrl(path, TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setUrl(null);
          return;
        }
        cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL_SECONDS - 60) * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [pathOrUrl]);

  return url;
}
