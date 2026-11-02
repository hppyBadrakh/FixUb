"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-sm font-[550] text-label whitespace-nowrap select-none transition-[background-color,border-color,color,transform] duration-[140ms] active:scale-[0.98] active:duration-[90ms] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 [@media(pointer:coarse)]:min-h-11";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-sunken",
  quiet: "text-ink hover:bg-surface-sunken",
  danger: "bg-danger-fill text-on-danger hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-5 text-body",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  /** Toggle buttons: shows the selected state and sets aria-pressed. */
  pressed?: boolean;
}

const pressedStyle = "border border-brand bg-brand-soft text-brand hover:bg-brand-soft";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconEnd: IconEnd, loading, fullWidth, pressed, className, children, disabled, onClick, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, pressed ? pressedStyle : variants[variant], sizes[size], fullWidth && "w-full", className)}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="size-5 fx-spin" strokeWidth={1.75} />
      ) : (
        Icon && <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
      )}
      {children}
      {IconEnd && <IconEnd aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconEnd: IconEnd,
  fullWidth,
  className,
  children,
  ...rest
}: Omit<ButtonProps, "loading" | "type"> & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {Icon && <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />}
      {children}
      {IconEnd && <IconEnd aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />}
    </Link>
  );
}

export function IconButton({
  icon: Icon,
  label,
  variant = "quiet",
  size = "md",
  className,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  label: string;
  variant?: Variant;
  size?: Size;
}) {
  const dim = size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], dim, "px-0", className)}
      {...rest}
    >
      <Icon aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  );
}
