"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Session, Persona } from "@/lib/db";

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [personaMap, setPersonaMap] = useState<Record<string, Persona>>({});
  const [loading, setLoading] = useState(true);
  const [repFilter, setRepFilter] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("coldcaller_rep_name");
    if (saved) setRepFilter(saved);

    fetch("/api/personas")
      .then((res) => res.json())
      .then((personas: Persona[]) => {
        const map: Record<string, Persona> = {};
        for (const p of personas) map[p.id] = p;
        setPersonaMap(map);
      })
      .catch((err) => console.error("Failed to load personas:", err));
  }, []);

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (repFilter.trim()) {
          params.set("rep_name", repFilter.trim());
        }
        const res = await fetch(`/api/sessions?${params}`);
        if (res.ok) {
          setSessions(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [repFilter]);

  // Leaderboard: top scores by rep
  const leaderboard = sessions
    .filter((s) => s.score)
    .reduce(
      (acc, s) => {
        if (
          !acc[s.rep_name] ||
          (s.score && acc[s.rep_name].score!.overall < s.score.overall)
        ) {
          acc[s.rep_name] = s;
        }
        return acc;
      },
      {} as Record<string, Session>
    );

  const leaderboardEntries = Object.values(leaderboard)
    .sort((a, b) => (b.score?.overall || 0) - (a.score?.overall || 0))
    .slice(0, 10);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const scoreColor = (score: number) =>
    score >= 7
      ? "text-green-400"
      : score >= 4
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Call History</h1>
            <p className="text-muted-foreground text-sm">
              Review your past calls and track improvement
            </p>
          </div>
          <Button onClick={() => router.push("/")} variant="outline">
            New Call
          </Button>
        </div>

        {/* Filter */}
        <Input
          placeholder="Filter by rep name..."
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="max-w-xs bg-background/50"
        />

        {/* Leaderboard */}
        {leaderboardEntries.length > 0 && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <h2 className="text-sm font-medium mb-3">Top Scores</h2>
              <div className="space-y-2">
                {leaderboardEntries.map((entry, i) => {
                  const persona = personaMap[entry.persona_id];
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground font-mono w-6">
                          #{i + 1}
                        </span>
                        <span className="font-medium">{entry.rep_name}</span>
                        <span className="text-muted-foreground text-xs">
                          vs {persona?.name || entry.persona_id}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-semibold ${scoreColor(
                          entry.score!.overall
                        )}`}
                      >
                        {entry.score!.overall}/10
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Separator className="border-border/30" />

        {/* Session list */}
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : sessions.length === 0 ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                No calls yet. Start practicing!
              </p>
              <Button
                onClick={() => router.push("/")}
                className="mt-4"
                variant="outline"
              >
                Make Your First Call
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const persona = personaMap[session.persona_id];
              return (
                <Card
                  key={session.id}
                  className="bg-card/50 border-border/50 cursor-pointer hover:border-border transition-colors"
                  onClick={() => router.push(`/results/${session.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {session.rep_name}
                          </span>
                          <span className="text-muted-foreground">&rarr;</span>
                          <span className="text-muted-foreground">
                            {persona?.name || session.persona_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatDate(session.created_at)}</span>
                          <span>{formatTime(session.duration_seconds)}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {persona?.title || session.persona_id}
                          </Badge>
                        </div>
                      </div>
                      {session.score && (
                        <div className="text-right">
                          <p
                            className={`text-2xl font-mono font-bold ${scoreColor(
                              session.score.overall
                            )}`}
                          >
                            {session.score.overall}
                          </p>
                          <p className="text-xs text-muted-foreground">/10</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
