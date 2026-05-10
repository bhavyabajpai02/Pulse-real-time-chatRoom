import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ZoomIn, ZoomOut, Maximize2, X, RotateCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  src: string | null;
  name?: string | null;
  onClose: () => void;
}

export function ImageViewer({ src, name, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (src) {
      setZoom(1);
      setRotation(0);
    }
  }, [src]);

  const fullscreen = useCallback(() => {
    const el = document.getElementById("pulse-viewer-img");
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  const download = useCallback(async () => {
    if (!src) return;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || "image";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }, [src, name]);

  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] sm:w-auto sm:max-w-5xl p-0 bg-black/95 border-border overflow-hidden [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        <div className="relative">
          <div className="absolute top-3 right-3 z-20 flex gap-1 rounded-xl bg-black/60 backdrop-blur p-1">
            <Button variant="ghost" size="icon" className="size-8 text-white hover:text-primary" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
              <ZoomOut className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-white hover:text-primary" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>
              <ZoomIn className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-white hover:text-primary" onClick={() => setRotation(r => r + 90)}>
              <RotateCw className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-white hover:text-primary" onClick={fullscreen}>
              <Maximize2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-white hover:text-primary" onClick={download}>
              <Download className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-white hover:text-destructive" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid place-items-center min-h-[60vh] max-h-[88vh] overflow-auto p-6">
            <AnimatePresence mode="wait">
              {src && (
                <motion.img
                  key={src}
                  id="pulse-viewer-img"
                  src={src}
                  alt={name || "image"}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                  className="max-w-full max-h-[80vh] object-contain transition-transform duration-200 select-none"
                  draggable={false}
                />
              )}
            </AnimatePresence>
          </div>
          {name && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 text-xs text-white/80 bg-black/60 px-3 py-1 rounded-full max-w-[60vw] truncate">
              {name}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
