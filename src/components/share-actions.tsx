"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type ShareActionsProps = {
  id: string;
  className?: string;
  iconOnly?: boolean;
  showOpen?: boolean;
};

export function ShareActions({ id, className, iconOnly = false, showOpen = true }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const href = `/letdove/${id}/`;

  async function copyLink() {
    const url = new URL(href, window.location.origin).toString();

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={className ?? "share-actions"}>
      <button
        aria-label={copied ? "Copied" : "Copy link"}
        className={iconOnly ? "icon-button" : "chip"}
        onClick={copyLink}
        title={copied ? "Copied" : "Copy link"}
        type="button"
      >
        {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
        {!iconOnly && (copied ? "Copied" : "Copy link")}
      </button>
      {showOpen && (
        <Link aria-label="Open page" className={iconOnly ? "icon-button" : "chip"} href={href} title="Open page">
          {!iconOnly && "Open page"}
          <ExternalLink aria-hidden="true" size={13} />
        </Link>
      )}
    </div>
  );
}
