"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScenarioSelector } from "@/components/ScenarioSelector";
import type { Persona } from "@/lib/db";

export default function HomePage() {
  const router = useRouter();
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  // No name field: the call is recorded against the signed-in account.
  useEffect(() => {
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data) => setPersonas(data))
      .catch((err) => console.error("Failed to load personas:", err))
      .finally(() => setLoading(false));
  }, []);

  const startCall = () => {
    if (!selectedPersona) return;
    router.push(`/call?persona=${selectedPersona}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">ColdCaller</h1>
          <p className="text-muted-foreground">
            Train on cold calling mobile service prospects. Get scored. Get better.
          </p>
        </div>

        {/* Persona selector */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Choose Your Prospect</h2>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading prospects...</p>
          ) : (
            <ScenarioSelector
              personas={personas}
              selected={selectedPersona}
              onSelect={setSelectedPersona}
            />
          )}
        </div>

        {/* Start button */}
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={startCall}
            disabled={!selectedPersona}
            className="w-full max-w-xs text-lg py-6"
          >
            Start Call
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/history")}
            className="text-muted-foreground"
          >
            View Call History
          </Button>
        </div>
      </div>
    </main>
  );
}
