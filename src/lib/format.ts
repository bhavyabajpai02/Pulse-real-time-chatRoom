import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

export function formatLastSeen(iso: string | null | undefined, isOnline?: boolean): string {
  if (isOnline) return "Online";
  if (!iso) return "Offline";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Last seen just now";
  if (diff < 24 * 60 * 60 * 1000) return `Last seen ${formatDistanceToNow(d, { addSuffix: true })}`;
  if (isToday(d)) return `Last seen today at ${format(d, "p")}`;
  if (isYesterday(d)) return `Last seen yesterday at ${format(d, "p")}`;
  return `Last seen ${format(d, "MMM d 'at' p")}`;
}

export function formatMessageTime(iso: string): string {
  return format(new Date(iso), "p");
}
