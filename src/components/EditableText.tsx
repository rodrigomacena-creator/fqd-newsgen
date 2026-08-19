"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type EditableTarget =
  | { type: "title" }
  | { type: "subtitle" }
  | { type: "instagramCaption" }
  | { type: "section"; index: number; part: "heading" | "text" };

type Status = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1000;

export function EditableText({
  articleId,
  target,
  initialValue,
  as = "p",
  className,
  multiline = false,
  onLiveChange,
}: {
  articleId: string;
  target: EditableTarget;
  initialValue: string;
  as?: "h1" | "h2" | "p" | "div";
  className?: string;
  multiline?: boolean;
  onLiveChange?: (value: string) => void;
}) {
  const Tag = as;
  const elRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastSavedRef = useRef(initialValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === lastSavedRef.current) return;

      setStatus("saving");
      setErrorMsg(null);

      const body =
        target.type === "section"
          ? { section: { index: target.index, [target.part]: trimmed } }
          : { [target.type]: trimmed };

      try {
        const res = await fetch(`/api/articles/${articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");

        lastSavedRef.current = trimmed;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    },
    [articleId, target]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // innerText (não textContent) é o que preserva quebras de linha visuais e
  // espaçamento como o usuário realmente digitou — textContent ignora a
  // estrutura de blocos que o navegador cria ao apertar Enter num
  // contentEditable, colando tudo numa string só.
  function getValue(): string {
    const el = elRef.current;
    return el?.innerText ?? el?.textContent ?? "";
  }

  function handleInput() {
    const value = getValue();
    onLiveChange?.(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(value), AUTOSAVE_DELAY_MS);
  }

  function handleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    save(getValue());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  return (
    <span className="group/editable relative block">
      <Tag
        ref={elRef as React.RefObject<HTMLHeadingElement & HTMLParagraphElement & HTMLDivElement>}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`${className ?? ""} ${multiline ? "whitespace-pre-wrap" : ""} -mx-2 -my-1 cursor-text rounded-md px-2 py-1 outline-none transition hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-accent-yellow/60`}
      >
        {initialValue}
      </Tag>

      {status !== "idle" && (
        <span
          className={`pointer-events-none absolute -top-2 right-0 -translate-y-full rounded-md px-2 py-0.5 text-[10px] font-medium ${
            status === "error"
              ? "bg-accent-red/15 text-accent-red"
              : "bg-accent-yellow/15 text-accent-yellow"
          }`}
        >
          {status === "saving" && "Salvando…"}
          {status === "saved" && "Salvo"}
          {status === "error" && (errorMsg ?? "Erro ao salvar")}
        </span>
      )}
    </span>
  );
}
