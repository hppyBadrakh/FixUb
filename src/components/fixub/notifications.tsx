"use client";

// The bell: what happened to the reports this person cares about. Opening it marks everything
// as read. Texts are put together here from the notification's type; the server never sends
// a sentence, and never a person's name.
import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/overlay";
import { useApi } from "@/lib/api/hooks";
import type { AppNotification, NotificationsResponse } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { PRIORITY_META, STATUS_META } from "@/lib/meta";
import { useStore } from "@/lib/store";
import type { Priority, ReportStatus } from "@/lib/types";
import { markNotificationsRead } from "@/server/actions/account";

export function NotificationBell({ className }: { className?: string }) {
  const { user, state } = useStore();
  const { lang, t, pick } = useT();
  const [open, setOpen] = useState(false);
  // Once a minute is enough for a bell; it is also re-read whenever the tab gets focus.
  const { data, mutate } = useApi<NotificationsResponse>(user ? "/api/v1/notifications" : null, { refreshInterval: 60_000 });
  if (!user) return null;

  const unread = data?.unread ?? 0;
  const label = unread ? t(`Мэдэгдэл: ${unread} шинэ`, `Notifications: ${unread} new`) : t("Мэдэгдэл", "Notifications");

  const hrefFor = (n: AppNotification) => {
    if (!n.reportId) return null;
    if (n.ownReport) return `/reports/${n.reportId}`;
    if (user.role === "admin") return `/admin/reports/${n.reportId}`;
    if (user.role === "org_staff" || user.role === "org_manager") return `/staff/reports/${n.reportId}`;
    return `/reports/${n.reportId}`;
  };

  const textOf = (n: AppNotification): string => {
    const ref = n.reportRef ?? t("устгагдсан мэдээлэл", "a deleted report");
    const what = n.ownReport ? t(`Таны ${ref} мэдээлэл`, `Your report ${ref}`) : ref;
    switch (n.type) {
      case "report.status": {
        const status = STATUS_META[n.data.to as ReportStatus];
        return status ? t(`${what}: ${status.label.mn.toLowerCase()}`, `${what} is now: ${status.label.en.toLowerCase()}`) : what;
      }
      case "report.reviewed": {
        const priority = PRIORITY_META[n.data.priority as Priority];
        return t(`${what}-г FixUB баг хянаж, ач холбогдлыг тогтоолоо${priority ? `: ${priority.label.mn.toLowerCase()}` : ""}`, `${what} was reviewed by the FixUB team${priority ? ` (priority: ${priority.label.en.toLowerCase()})` : ""}`);
      }
      case "report.assigned": {
        const org = state.organizations.find((o) => o.id === n.data.organizationId);
        return n.ownReport
          ? t(`${what}-г ${org ? pick(org.name) : "байгууллага"}-д хуваарилалаа`, `${what} was assigned to ${org ? pick(org.name) : "an organization"}`)
          : t(`${ref} танай байгууллагад хуваарилагдлаа`, `${ref} was assigned to your organization`);
      }
      case "report.disputed":
        return t(`${ref}: иргэд засаагүй хэвээр гэж хариулж байна`, `${ref}: citizens say it is still broken`);
      case "report.hidden":
        return n.data.automatic
          ? t(`${what} хэд хэдэн хүн мэдэгдсэн тул хянагч шалгах хүртэл нуугдлаа`, `${what} was hidden until a moderator reviews it, because several people flagged it`)
          : t(`${what}-г хянагч нуулаа`, `${what} was hidden by a moderator`);
      case "report.restored":
        return t(`${what} дахин нийтэд харагдаж байна`, `${what} is public again`);
      default:
        return what;
    }
  };

  const show = () => {
    setOpen(true);
    if (unread) void markNotificationsRead({}).then(() => mutate());
  };

  return (
    <>
      <span className={cn("relative inline-flex", className)}>
        <IconButton icon={Bell} label={label} onClick={show} />
        {unread > 0 && (
          <span aria-hidden className="pointer-events-none absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[11px] font-[700] leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
      <Sheet open={open} title={t("Мэдэгдэл", "Notifications")} onClose={() => setOpen(false)}>
        {!data || data.notifications.length === 0 ? (
          <p className="py-8 text-center text-small text-ink-muted">{t("Одоогоор мэдэгдэл алга.", "Nothing yet.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.notifications.map((n) => {
              const href = hrefFor(n);
              const body = (
                <>
                  <span className={cn("block text-label", n.read ? "font-[500] text-ink-muted" : "font-[650] text-ink")}>{textOf(n)}</span>
                  <span className="block text-caption text-ink-subtle">{formatDateTime(n.createdAt, lang)}</span>
                </>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <Link href={href} onClick={() => setOpen(false)} className="block rounded-sm px-1 py-3 hover:bg-surface-sunken">
                      {body}
                    </Link>
                  ) : (
                    <span className="block px-1 py-3">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
