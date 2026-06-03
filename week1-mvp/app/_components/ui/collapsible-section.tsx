"use client";

import { ChevronDown } from "lucide-react";
import { ReactNode, useState } from "react";

/**
 * 可折叠分组（受控 / 非受控两用）
 *
 * v2（全局 UI 统一）：
 *   - 标题里若以 ①②③… 圆圈序号开头，自动渲染成「圆角矩形主题色序号徽标」+ 纯文字标题
 *   - badge（数字 / 计数）统一渲染成主题色圆角胶囊 + SVG ✓（替代字符 √）
 */

export interface CollapsibleSectionProps {
  title: ReactNode;
  badge?: number | string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "default" | "minimal";
  hideChevron?: boolean;
  children: ReactNode;
  className?: string;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

function parseStep(title: ReactNode): { step: number | null; text: ReactNode } {
  if (typeof title !== "string") return { step: null, text: title };
  const trimmed = title.trimStart();
  const idx = CIRCLED.indexOf(trimmed[0]);
  if (idx === -1) return { step: null, text: title };
  return { step: idx + 1, text: trimmed.slice(1).trimStart() };
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-5 h-5 rounded-md bg-brand-600 text-white inline-flex items-center justify-center text-[11px] font-bold shrink-0 font-mono">
      {n}
    </span>
  );
}

function CountBadge({ value }: { value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold border border-brand-200">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
      {value}
    </span>
  );
}

export function CollapsibleSection({
  title,
  badge,
  description,
  headerExtra,
  defaultOpen = true,
  open,
  onOpenChange,
  variant = "default",
  hideChevron = false,
  children,
  className = "",
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const { step, text } = parseStep(title);

  function toggle() {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  if (variant === "minimal") {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center gap-2 py-1 text-left group"
          aria-expanded={isOpen}
        >
          {!hideChevron ? (
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              className={`text-fg-tertiary transition-transform duration-base ${isOpen ? "" : "-rotate-90"}`}
            />
          ) : null}
          {step !== null ? <StepBadge n={step} /> : null}
          <span className="text-[13px] font-medium text-fg-secondary group-hover:text-fg-primary">
            {text}
          </span>
          {badge !== undefined ? <CountBadge value={badge} /> : null}
          {headerExtra ? (
            <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
              {headerExtra}
            </span>
          ) : null}
        </button>
        {isOpen ? <div className="pt-0.5 pb-2">{children}</div> : null}
      </div>
    );
  }

  return (
    <section
      className={`rounded-lg border border-border-subtle bg-bg-card overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-bg-hover transition-colors"
        aria-expanded={isOpen}
      >
        {!hideChevron ? (
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={`text-fg-tertiary transition-transform duration-base ${isOpen ? "" : "-rotate-90"}`}
          />
        ) : null}
        {step !== null ? <StepBadge n={step} /> : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-fg-primary">
              {text}
            </span>
            {badge !== undefined ? <CountBadge value={badge} /> : null}
          </div>
          {description ? (
            <div className="text-[12px] text-fg-tertiary mt-0.5 leading-snug">
              {description}
            </div>
          ) : null}
        </div>
        {headerExtra ? (
          <div onClick={(e) => e.stopPropagation()}>{headerExtra}</div>
        ) : null}
      </button>
      {isOpen ? (
        <div className="px-4 pb-3 pt-1 border-t border-border-subtle animate-fade-in">
          {children}
        </div>
      ) : null}
    </section>
  );
}
