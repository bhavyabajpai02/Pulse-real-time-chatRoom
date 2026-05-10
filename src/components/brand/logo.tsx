import { Link } from "@tanstack/react-router";
import iconSrc from "@/assets/pulse-icon.png";
import wordmarkSrc from "@/assets/pulse-wordmark.png";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "icon" | "full";
  size?: "sm" | "md" | "lg";
  asLink?: boolean;
  className?: string;
}

const ICON_SIZE = { sm: 24, md: 32, lg: 44 } as const;
const WORD_HEIGHT = { sm: 18, md: 22, lg: 30 } as const;

export function Logo({ variant = "full", size = "md", asLink = false, className }: LogoProps) {
  const iconPx = ICON_SIZE[size];
  const wordPx = WORD_HEIGHT[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <span
        className="relative inline-flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
        style={{ width: iconPx, height: iconPx }}
      >
        <span
          className="absolute inset-0 rounded-[28%] bg-gradient-primary opacity-40 blur-md animate-pulse-soft"
          aria-hidden
        />
        <img
          src={iconSrc}
          alt=""
          width={iconPx}
          height={iconPx}
          className="relative z-10 drop-shadow-[0_4px_18px_rgba(124,92,255,0.45)]"
          draggable={false}
        />
      </span>
      {variant === "full" && (
        <img
          src={wordmarkSrc}
          alt="Pulse"
          height={wordPx}
          style={{ height: wordPx, width: "auto" }}
          className="relative -mb-0.5"
          draggable={false}
        />
      )}
      {variant === "icon" && <span className="sr-only">Pulse</span>}
    </span>
  );

  if (asLink) {
    return (
      <Link to="/" className="group inline-flex items-center" aria-label="Pulse — home">
        {inner}
      </Link>
    );
  }
  return <span className="group inline-flex items-center">{inner}</span>;
}

export function LogoSplash() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Logo variant="icon" size="lg" />
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
          Loading
        </span>
      </div>
    </div>
  );
}
