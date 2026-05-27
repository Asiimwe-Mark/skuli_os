"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { UserCircle, Upload, X, Loader2 } from "lucide-react";

interface PhotoUploadProps {
  currentUrl?: string | null;
  onUpload: (file: File) => Promise<string>;
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-32 h-32",
};

const iconSizes = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

export function PhotoUpload({
  currentUrl,
  onUpload,
  onRemove,
  size = "md",
  className,
}: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = preview || currentUrl;

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError("Image must be less than 2MB");
        return;
      }

      setError(null);

      // Create preview
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);

      // Upload
      setUploading(true);
      try {
        await onUpload(file);
      } catch {
        setError("Upload failed");
        setPreview(null);
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
  );

  const handleRemove = useCallback(() => {
    setPreview(null);
    setError(null);
    onRemove?.();
    if (inputRef.current) inputRef.current.value = "";
  }, [onRemove]);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        className={cn(
          "relative rounded-full overflow-hidden border-2 border-dashed border-navy-600 hover:border-amber-400 transition-colors cursor-pointer group",
          sizeClasses[size]
        )}
        onClick={() => inputRef.current?.click()}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Photo"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-navy-700 flex items-center justify-center">
            <UserCircle className={cn("text-foreground/40", iconSizes[size])} />
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-white" />
          )}
        </div>
      </div>

      {/* Remove button */}
      {displayUrl && !uploading && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Remove
        </button>
      )}

      {/* Error */}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {/* Hidden input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
