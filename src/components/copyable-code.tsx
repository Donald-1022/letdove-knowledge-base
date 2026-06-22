"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

type CopyableCodeProps = {
  code: string;
  className?: string;
};

export function CopyableCode({ code, className }: CopyableCodeProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      aria-label={copied ? "Code copied" : "Copy code"}
      className={className ?? "post-code subtle-code code-copy"}
      onClick={copyCode}
      title={copied ? "Copied" : "Copy code"}
      type="button"
    >
      {code}
      {copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}
    </button>
  );
}
