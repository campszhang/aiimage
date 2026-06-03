"use client";

import { ReactNode } from "react";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  /** 选中时在分段控件下方显示的说明（随选中项变化） */
  hint?: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

/**
 * 分段选择器（灰底轨道 + 品牌色填充激活态，iOS 风格）
 *
 * 激活：品牌色实心填充 + 白字 + 加粗 + 轻投影。
 * 未选：灰底轨道里的透明项，hover 加深文字。
 * 若选项带 hint，会在控件下方显示当前选中项的说明。
 */
export function SegmentedControl({
  value,
  onChange,
  options,
  size = "md",
  ariaLabel,
  className = "",
}: SegmentedControlProps) {
  const active = options.find((o) => o.value === value);
  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="flex bg-bg-tertiary p-1 rounded-lg gap-1"
      >
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(opt.value)}
              className={
                "flex-1 rounded-md text-center transition-all cursor-pointer " +
                (size === "sm" ? "py-1 text-[11px] " : "py-1.5 text-[12px] ") +
                (on
                  ? "bg-brand-600 text-white font-bold shadow-sm"
                  : "text-fg-tertiary hover:text-fg-secondary font-medium")
              }
            >
              <span className="inline-flex items-center justify-center gap-1">
                {opt.icon}
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      {active?.hint ? (
        <p className="mt-1.5 text-[10.5px] text-fg-muted leading-relaxed">
          {active.hint}
        </p>
      ) : null}
    </div>
  );
}
