"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScenarioSelector } from "@/components/ScenarioSelector";
import type { Persona } from "@/lib/db";
import type { RepProfile } from "@/lib/rep-profile";

export default function HomePage() {
  const router = useRouter();
  const [repName, setRepName] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [repProfile, setRepProfile] = useState<RepProfile | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("coldcaller_rep_name");
    if (saved) setRepName(saved);

    const rawProfile = localStorage.getItem("coldcaller_rep_profile");
    if (rawProfile) {
      try { setRepProfile(JSON.parse(rawProfile)); } catch { /* ignore */ }
    }

    fetch("/api/personas")
      .then((res) => res.json())
      .then((data) => setPersonas(data))
      .catch((err) => console.error("Failed to load personas:", err))
      .finally(() => setLoading(false));
  }, []);

  const startCall = () => {
    if (!repName.trim() || !selectedPersona) return;
    localStorage.setItem("coldcaller_rep_name", repName.trim());
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

        {/* Rep profile summary / setup prompt */}
        {repProfile?.companyName ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {repProfile.companyName} — {repProfile.planName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {repProfile.contractType}
                    {repProfile.dataAllowance ? ` · ${repProfile.dataAllowance}` : ""}
                    {repProfile.monthlyPrice ? ` · ${repProfile.monthlyPrice}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/settings")}
                  className="text-muted-foreground text-xs gap-1"
                >
                  Edit ✎
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center space-y-1">
            <Button
              variant="link"
              size="sm"
              onClick={() => router.push("/settings")}
              className="text-muted-foreground text-sm"
            >
              Set up your rep profile →
            </Button>
            <p className="text-xs text-muted-foreground">
              Optional — adds product context to AI coaching and scoring
            </p>
          </div>
        )}

        {/* Rep name */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <label className="text-sm font-medium mb-2 block">
              Your Name
            </label>
            <Input
              placeholder="Enter your name..."
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
              className="bg-background/50"
            />
          </CardContent>
        </Card>

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
            disabled={!repName.trim() || !selectedPersona}
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
