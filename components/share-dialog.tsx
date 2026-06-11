"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useShares,
  useAddShare,
  useSetShareRole,
  useRemoveShare,
} from "@/hooks/use-share-mutations";

export function ShareDialog({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const { data: shares, isLoading } = useShares(tripId);
  const addShare = useAddShare(tripId);
  const setRole = useSetShareRole(tripId);
  const removeShare = useRemoveShare(tripId);
  const [email, setEmail] = useState("");
  const [role, setRole2] = useState<"viewer" | "editor">("viewer");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function add() {
    const v = email.trim();
    if (!v) return;
    addShare.mutate(
      { email: v, role },
      { onSuccess: () => setEmail("") },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-96 max-w-[90vw] rounded-md border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="share-title" className="mb-3 text-sm font-semibold">Share trip</h3>

        <div className="space-y-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : shares && shares.length > 0 ? (
            shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{s.email}</span>
                <select
                  aria-label={`Role for ${s.email}`}
                  value={s.role}
                  disabled={setRole.isPending}
                  onChange={(e) =>
                    setRole.mutate({ shareId: s.id, role: e.target.value as "viewer" | "editor" })
                  }
                  className="rounded border bg-background px-1 py-0.5 text-xs"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${s.email}`}
                  className="px-1 text-xs text-muted-foreground hover:text-red-600 disabled:opacity-50"
                  disabled={removeShare.isPending}
                  onClick={() => removeShare.mutate(s.id)}
                >
                  ✕
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Not shared with anyone yet.</p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            aria-label="Email to share with"
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <select
            aria-label="Role for new share"
            value={role}
            onChange={(e) => setRole2(e.target.value as "viewer" | "editor")}
            className="rounded border bg-background px-1 py-0.5 text-xs"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <Button size="sm" onClick={add} disabled={addShare.isPending || !email.trim()}>
            Add
          </Button>
        </div>
        {addShare.isError ? (
          <p className="mt-2 text-xs text-red-600">Couldn’t add — check the email and try again.</p>
        ) : null}

        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
