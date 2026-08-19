"use client";

import { useEffect, useRef, useState } from "react";

export interface ModelPickerOption {
  id: string;
  label: string;
}

const MAX_VISIBLE = 200;

export function ModelPicker({
  id,
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: ModelPickerOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.id.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
      )
    : options;
  const visible = filtered.slice(0, MAX_VISIBLE);

  function selectOption(optionId: string) {
    onChange(optionId);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
      <input
        id={id}
        autoComplete="off"
        value={open ? query : value}
        disabled={disabled}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="ex.: google/gemini-2.5-flash-lite"
        className="mt-2 w-full rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent-yellow disabled:opacity-50"
      />

      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {visible.length === 0 && (
            <li className="px-4 py-3 text-sm text-text-secondary">
              Nenhum modelo encontrado — o texto digitado será usado como ID.
            </li>
          )}
          {visible.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={() => selectOption(option.id)}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-accent-yellow/10"
              >
                <div className="font-medium">{option.id}</div>
                <div className="text-xs text-text-secondary">{option.label}</div>
              </button>
            </li>
          ))}
          {filtered.length > MAX_VISIBLE && (
            <li className="px-4 py-2 text-xs text-text-secondary">
              +{filtered.length - MAX_VISIBLE} modelos — refine a busca para ver mais.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
