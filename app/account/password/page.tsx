"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Doubles as the forced first-login screen. proxy.ts redirects here for any
// user whose token carries mc=true, so this page must not depend on
// useSearchParams — it needs to work as a plain redirect target.
export default function ChangePasswordPage() {
  const router = useRouter();
  const [forced, setForced] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => setForced(user?.mustChangePassword === true))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError("The two new passwords don't match");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });

      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }

      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not change password");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">
          {forced ? "Choose a password" : "Change password"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {forced
            ? "You're signed in with a temporary password. Pick your own before continuing."
            : "Enter your current password, then your new one."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder={forced ? "Temporary password" : "Current password"}
            autoFocus
            autoComplete="current-password"
            aria-label="Current password"
          />
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            aria-label="New password"
          />
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            aria-label="Confirm new password"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="w-full"
          >
            {busy ? "Saving…" : "Save password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
