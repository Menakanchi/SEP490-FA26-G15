"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
function cx(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  disabled?: boolean;
}

export interface VehicSimSelectProps<T extends string | number = string | number> {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}

export function VehicSimSelect<T extends string | number = string | number>({
  value,
  onChange,
  options,
  placeholder = "Chọn một mục…",
  className,
  buttonClassName,
  menuClassName,
  disabled = false,
  "aria-label": ariaLabel,
  id,
}: VehicSimSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cx("relative inline-block w-full text-left", className)}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cx(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-solid border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 shadow-xs transition-colors",
          "hover:border-slate-400 dark:hover:border-slate-600 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20",
          disabled && "cursor-not-allowed opacity-50 bg-slate-50 dark:bg-slate-800/50",
          buttonClassName,
        )}
      >
        <span className="truncate text-left">
          {selectedOption ? selectedOption.label : <span className="font-normal text-slate-400">{placeholder}</span>}
        </span>
        <ChevronDown
          className={cx(
            "size-4 shrink-0 text-slate-400 transition-transform duration-200",
            isOpen && "rotate-180 text-emerald-600 dark:text-emerald-400",
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={cx(
            "absolute left-0 top-[calc(100%+6px)] z-50 max-h-64 w-full min-w-[280px] overflow-y-auto rounded-xl border border-solid border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl shadow-slate-900/10 backdrop-blur-md",
            menuClassName,
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-center text-[12.5px] text-slate-400">
              Không có lựa chọn nào
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                    }
                  }}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                    opt.disabled && "cursor-not-allowed opacity-40",
                    !opt.disabled && !isSelected && "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
                    isSelected && "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold",
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[11px] text-slate-400 font-normal truncate mt-0.5">
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
