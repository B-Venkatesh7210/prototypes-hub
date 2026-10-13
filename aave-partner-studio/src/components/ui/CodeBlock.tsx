"use client";

import { useState, type ReactNode } from "react";

const KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "async", "await", "return", "function", "new", "type", "interface", "if", "else", "for", "of", "as", "default", "true", "false", "null", "undefined",
]);

const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*n?\b)|(\b[A-Za-z_$][\w$]*\b)|(<\/?[A-Z][\w.]*)/g;

/** Tiny highlighter: comments, strings, numbers, keywords and JSX component tags. */
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(code.slice(last, i));
    const [text, comment, str, num, word, tag] = m;
    const cls = comment
      ? "text-dim italic"
      : str
        ? "text-[#a5e3b1]"
        : num
          ? "text-[#f5c084]"
          : tag
            ? "text-[#7fe3ea]"
            : word && KEYWORDS.has(word)
              ? "text-[#d99be0]"
              : "";
    out.push(cls ? <span key={i} className={cls}>{text}</span> : text);
    last = i + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({ code, title, lang = "tsx" }: { code: string; title?: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-[#0c0d11]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p className="font-mono text-xs text-muted">{title ?? lang}</p>
        <button
          type="button"
          className="cursor-pointer font-mono text-xs text-muted hover:text-bright"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-4 font-mono text-[0.8rem] leading-relaxed text-bright">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}
