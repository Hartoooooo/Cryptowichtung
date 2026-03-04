"use client";

import { useEffect, useRef, useState } from "react";

interface CustomSelectDropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  minWidth?: string;
  buttonClassName?: string;
}

export default function CustomSelectDropdown({
  value,
  onChange,
  options,
  placeholder,
  minWidth = "88px",
  buttonClassName,
}: CustomSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center h-9 rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 text-xs text-neutral-200 transition-all hover:border-neutral-600 hover:bg-neutral-800/80 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 cursor-pointer shrink-0 ${buttonClassName ?? ""}`}
        style={{ minWidth }}
      >
        <span className="flex-1 text-left truncate">{current?.label ?? placeholder}</span>
        <svg
          className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[140px] max-h-48 overflow-y-auto overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl shadow-black/20">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
              !value ? "bg-amber-500/15 text-amber-400" : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
            }`}
          >
            <span className="w-3 shrink-0 flex items-center justify-center">
              {!value && (
                <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span className={!value ? "font-medium" : ""}>— {placeholder} —</span>
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                opt.value === value
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              }`}
            >
              <span className="w-3 shrink-0 flex items-center justify-center">
                {opt.value === value && (
                  <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
              <span className={opt.value === value ? "font-medium" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
