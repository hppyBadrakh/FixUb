"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { getPhoto } from "@/lib/data/photoStore";
import { ICONS } from "@/lib/meta";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { CategorySlug } from "@/lib/types";

/** Object URL for a stored photo, revoked on unmount. */
export function usePhotoUrl(id: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let made: string | null = null;
    getPhoto(id).then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [id]);
  return url;
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
  if (!url) return <NoPhoto category={category} className={className} loading />;
  // eslint-disable-next-line @next/next/no-img-element -- local object URL, not optimizable by next/image
  return <img src={url} alt={alt} className={cn("object-cover", className)} />;
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
