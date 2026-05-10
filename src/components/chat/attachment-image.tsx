import { useSignedAttachmentUrl } from "@/hooks/use-signed-url";
import { Image as ImageIcon } from "lucide-react";

interface Props {
  path: string;
  name?: string | null;
  onClick?: (resolvedUrl: string) => void;
  className?: string;
}

export function AttachmentImage({ path, name, onClick, className }: Props) {
  const url = useSignedAttachmentUrl(path);

  if (!url) {
    return (
      <div className={`grid place-items-center bg-muted/40 rounded-lg w-56 h-40 ${className || ""}`}>
        <ImageIcon className="size-6 text-muted-foreground animate-pulse" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(url)}
      className={`block group/img relative overflow-hidden rounded-lg ${className || ""}`}
    >
      <img
        src={url}
        alt={name || "image"}
        loading="lazy"
        className="max-w-xs max-h-72 w-auto h-auto object-cover rounded-lg group-hover/img:brightness-110 transition"
      />
    </button>
  );
}
