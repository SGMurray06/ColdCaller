"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScoreCard } from "@/components/ScoreCard";
import { getPersona } from "@/lib/personas";
import type { Session } from "@/lib/db";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions?id=${params.sessionId}`);
        if (!res.ok) throw new Error("Failed to fetch session");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [params.sessionId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading results...</p>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error || "Session not found"}</p>
        <Button onClick={() => router.push("/")} variant="outline">
          Back to Home
        </Button>
      </main>
    );
  }

  const persona = getPersona(session.persona_id);

  return (
    <main className="min-h-screen flex flex-col items-center p-4 md:p-8 py-12">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Call Results</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {session.rep_name} &rarr; {persona?.name || session.persona_id}
          </p>
        </div>

        {session.score ? (
          <div className="flex justify-center">
            <ScoreCard
              score={session.score}
              personaName={persona?.name || session.persona_id}
              duration={session.duration_seconds}
            />
          </div>
        ) : (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                No score available for this call.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Transcript */}
        {session.transcript.length > 0 && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="p-3 border-b border-border/50">
                <p className="text-sm font-medium">Full Transcript</p>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="p-3 space-y-3">
                  {session.transcript.map((entry, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${
                        entry.speaker === "rep" ? "items-end" : "items-start"
                      }`}
                    >
                      <span className="text-xs text-muted-foreground mb-1">
                        {entry.speaker === "rep"
                          ? session.rep_name
                          : persona?.name || "Prospect"}
                      </span>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          entry.speaker === "rep"
                            ? "bg-sky-500/20 text-sky-100"
                            : "bg-orange-500/20 text-orange-100"
                        }`}
                      >
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button onClick={() => router.push("/")} variant="outline">
            Try Again
          </Button>
          <Button onClick={() => router.push("/history")} variant="ghost">
            View History
          </Button>
        </div>
      </div>
    </main>
  );
}
