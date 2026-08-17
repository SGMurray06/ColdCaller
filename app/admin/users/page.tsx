"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminNav } from "@/components/AdminNav";
import type { PublicUser } from "@/lib/db";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"rep" | "admin">("rep");

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  // Every mutation goes through here so one place handles the error body and
  // the refresh.
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
        return false;
      }
      await fetchUsers();
      return true;
    } catch {
      setError("Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not create user");
        return;
      }
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("rep");
      await fetchUsers();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(user: PublicUser) {
    const next = prompt(
      `New temporary password for ${user.displayName}.\nThey'll be asked to change it at their next sign-in.`
    );
    if (!next) return;
    if (await patch({ id: user.id, password: next })) {
      alert(`Temporary password set for ${user.displayName}.`);
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <AdminNav />

        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm">
            Add reps, reset passwords, and deactivate people who&apos;ve left.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 border border-red-400/30 rounded-md p-3">
            {error}
          </p>
        )}

        {/* Add a user */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium mb-3">Add a rep</h2>
            <form
              onSubmit={handleCreate}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                aria-label="Username"
              />
              <Input
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                aria-label="Display name"
              />
              <Input
                placeholder="Temporary password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Temporary password"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "rep" | "admin")}
                aria-label="Role"
                className="h-9 rounded-md border border-input bg-background/50 px-3 text-sm"
              >
                <option value="rep">Rep</option>
                <option value="admin">Admin</option>
              </select>
              <Button type="submit" disabled={busy}>
                {busy ? "Working…" : "Add"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-3">
              The temporary password is used once — they&apos;ll be asked to
              choose their own the first time they sign in.
            </p>
          </CardContent>
        </Card>

        {/* User list */}
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <Card key={user.id} className="bg-card/50 border-border/50">
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{user.displayName}</span>
                      <span className="text-muted-foreground text-sm">
                        @{user.username}
                      </span>
                      {user.role === "admin" && (
                        <Badge variant="outline" className="text-[10px]">
                          Admin
                        </Badge>
                      )}
                      {!user.isActive && (
                        <Badge variant="outline" className="text-[10px] text-red-400">
                          Deactivated
                        </Badge>
                      )}
                      {user.mustChangePassword && (
                        <Badge variant="outline" className="text-[10px] text-yellow-400">
                          Temp password
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleResetPassword(user)}
                    >
                      Reset password
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          id: user.id,
                          role: user.role === "admin" ? "rep" : "admin",
                        })
                      }
                    >
                      {user.role === "admin" ? "Make rep" : "Make admin"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        patch({ id: user.id, isActive: !user.isActive })
                      }
                    >
                      {user.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
