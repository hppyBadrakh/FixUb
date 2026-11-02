"use client";

import { useId } from "react";
import { Check, ChevronDown, Search, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { ReportStatus } from "@/lib/types";

const fieldBox =
  "w-full rounded-sm border bg-surface text-body text-ink placeholder:text-ink-subtle transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-offset-1";

function FieldLabel({
  htmlFor,
  label,
  required,
  optional,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  optional?: boolean;
}) {
  const { t } = useT();
  return (
    <label htmlFor={htmlFor} className="block text-label font-[550] text-ink">
      {label}
      {required && <span className="ml-1.5 font-normal text-ink-subtle">{t("(заавал)", "(required)")}</span>}
      {optional && <span className="ml-1.5 font-normal text-ink-subtle">{t("Заавал биш", "Optional")}</span>}
    </label>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-small font-[550] text-danger fx-reveal">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      {error}
    </p>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  icon?: LucideIcon;
  onClear?: () => void;
  onBlur?: () => void;
  type?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hideLabel?: boolean;
  autoComplete?: string;
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  optional,
  multiline,
  rows = 4,
  maxLength,
  placeholder,
  icon: Icon,
  onClear,
  onBlur,
  type = "text",
  className,
  inputMode,
  hideLabel,
  autoComplete,
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(" ") || undefined;
  const border = error ? "border-2 border-danger" : "border-line-strong";
  return (
    <div className={className}>
      <div className={hideLabel ? "sr-only" : undefined}>
        <FieldLabel htmlFor={id} label={label} required={required} optional={optional} />
      </div>
      {hint && (
        <p id={hintId} className="mt-0.5 text-small text-ink-subtle">
          {hint}
        </p>
      )}
      <div className={cn("relative", !hideLabel && "mt-1.5")}>
        {Icon && (
          <Icon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" strokeWidth={1.75} />
        )}
        {multiline ? (
          <textarea
            id={id}
            value={value}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={cn(fieldBox, border, "min-h-28 resize-y px-3 py-2.5")}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            inputMode={inputMode}
            autoComplete={autoComplete}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={cn(fieldBox, border, "h-10 px-3 [@media(pointer:coarse)]:h-11", Icon && "pl-10", onClear && value && "pr-10")}
          />
        )}
        {onClear && value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear"
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-ink-subtle hover:bg-surface-sunken"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-start justify-between gap-3">
        <FieldError id={errId} error={error} />
        {maxLength && multiline && (
          <p className="ml-auto mt-1.5 shrink-0 text-caption text-ink-subtle tnum" aria-live="polite">
            {value.length} / {maxLength.toLocaleString("en-US")}
          </p>
        )}
      </div>
    </div>
  );
}

export function SearchField(props: Omit<TextFieldProps, "icon" | "type">) {
  return <TextField {...props} type="search" icon={Search} />;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  hideLabel,
  className,
  size = "md",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  hint?: string;
  error?: string;
  required?: boolean;
  hideLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div className={className}>
      <div className={hideLabel ? "sr-only" : undefined}>
        <FieldLabel htmlFor={id} label={label} required={required} />
      </div>
      {hint && <p className="mt-0.5 text-small text-ink-subtle">{hint}</p>}
      <div className={cn("relative", !hideLabel && "mt-1.5")}>
        <select
          id={id}
          value={value}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            fieldBox,
            error ? "border-2 border-danger" : "border-line-strong",
            "appearance-none pr-9 pl-3",
            size === "sm" ? "h-9 text-small" : "h-10 [@media(pointer:coarse)]:h-11",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      </div>
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-sm bg-surface-sunken p-1", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 rounded-[6px] px-3 text-small font-[550] transition-colors duration-[200ms] [@media(pointer:coarse)]:h-10",
              selected ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const statusDotClass: Record<ReportStatus, string> = {
  reported: "bg-st-reported",
  investigating: "bg-st-investigating",
  in_progress: "bg-st-in-progress",
  resolved: "bg-st-resolved",
  closed: "bg-st-closed",
};

export function FilterChip({
  selected,
  onToggle,
  icon: Icon,
  dot,
  count,
  children,
}: {
  selected: boolean;
  onToggle: (next: boolean) => void;
  icon?: LucideIcon;
  dot?: ReportStatus;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(!selected)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-small font-[550] transition-colors duration-[140ms] [@media(pointer:coarse)]:h-11",
        selected ? "border-brand bg-brand-soft text-brand" : "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
      )}
    >
      {selected && <Check aria-hidden className="size-4" strokeWidth={2} />}
      {dot && <span aria-hidden className={cn("size-2 rounded-full", statusDotClass[dot])} />}
      {Icon && <Icon aria-hidden className="size-4" strokeWidth={2} />}
      {children}
      {count !== undefined && <span className={cn("tnum", selected ? "text-brand" : "text-ink-subtle")}>{count}</span>}
    </button>
  );
}
