"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Only allow same-origin absolute paths. Without this, ?next=//evil.com turns
// the login page into an open redirect.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        // The proxy would redirect here anyway; going straight there avoids a
        // pointless bounce through the page they asked for.
        router.replace(body.mustChangePassword ? "/account/password" : next);
        // Drop any RSC payloads cached while unauthenticated.
        router.refresh();
        return;
      }

      const body = await res.json().catch(() => ({}));
      setError(
        res.status === 429
          ? body.error ?? "Too many attempts. Wait a minute and try again."
          : "Incorrect username or password"
      );
      setPassword("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sign in with your ColdCaller account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            aria-label="Username"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={busy || username.length === 0 || password.length === 0}
            className="w-full"
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}

// useSearchParams needs a Suspense boundary or `npm run build` fails — it works
// fine in `next dev`, so the failure only shows up at build time.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
