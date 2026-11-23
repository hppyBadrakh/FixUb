"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { photoUrl } from "@/lib/api/photos";
import { ICONS } from "@/lib/meta";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { CategorySlug } from "@/lib/types";

/** Where a stored photo is loaded from: `/api/v1/photos/{id}`. */
export function usePhotoUrl(id: string | undefined) {
  return id ? photoUrl(id) : null;
}

export function Photo({
  id,
  alt,
  className,
  category,
}: {
  id: string;
  alt: string;
  className?: string;
  category?: CategorySlug;
}) {
  const url = usePhotoUrl(id);
  // A photo that can't be loaded (hidden since, or gone) falls back to the "no photo" tile.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url) return <NoPhoto category={category} className={className} loading />;
  if (failedUrl === url) return <NoPhoto category={category} className={className} />;
  // eslint-disable-next-line @next/next/no-img-element -- our own photo endpoint, which needs the session cookie
  return <img src={url} alt={alt} className={cn("object-cover", className)} onError={() => setFailedUrl(url)} />;
}

/** Tile shown when a report has no photo: the category icon, never a stock image. */
export function NoPhoto({
  category,
  className,
  loading,
}: {
  category?: CategorySlug;
  className?: string;
  loading?: boolean;
}) {
  const { t } = useT();
  const { catalog } = useStore();
  const Icon = category ? ICONS[catalog.get(category)?.icon ?? "ellipsis"] : ImageIcon;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 bg-surface-sunken text-ink-subtle",
        loading && "fx-skeleton",
        className,
      )}
    >
      {!loading && (
        <>
          <Icon aria-hidden className="size-6" strokeWidth={1.5} />
          <span className="text-[12px] leading-4">{t("Зураггүй", "No photo")}</span>
        </>
      )}
    </div>
  );
}
