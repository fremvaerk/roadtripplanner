"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function TripForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      startName: String(form.get("startName") ?? ""),
      description: String(form.get("description") ?? ""),
    };

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not create trip.");
        setSubmitting(false);
        return;
      }
      const trip = await res.json();
      router.push(`/trips/${trip.id}`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="title">Trip title</Label>
        <Input id="title" name="title" placeholder="Tuscany Loop" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="startName">Start location</Label>
        <Input id="startName" name="startName" placeholder="Florence, Italy" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">What's the trip? (optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder="A relaxed week of Tuscan food, hilltop towns, and art."
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create trip"}
      </Button>
    </form>
  );
}
