"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Conversation } from "@elevenlabs/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { CoachingSidebar } from "@/components/CoachingSidebar";
import type { LiveSuggestion } from "@/components/CoachingSidebar";
import type { Persona } from "@/lib/db";
import type { TranscriptEntry, ScoreResult } from "@/lib/db";
import type { RepProfile } from "@/lib/rep-profile";
import { deriveProspectNumber } from "@/lib/rep-profile";

interface CallInterfaceProps {
  persona: Persona;
  repName: string;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

export function CallInterface({ persona, repName }: CallInterfaceProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [duration, setDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSuggestions, setLiveSuggestions] = useState<LiveSuggestion[]>([]);
  const [isCoaching, setIsCoaching] = useState(false);
  const [repProfile, setRepProfile] = useState<RepProfile | null>(null);

  const conversationRef = useRef<Awaited<
    ReturnType<typeof Conversation.startSession>
  > | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const coachDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionIdRef = useRef(0);

  // Load rep profile from localStorage
  useEffect(() => {
    const raw = localStorage.getItem("coldcaller_rep_profile");
    if (raw) {
      try { setRepProfile(JSON.parse(raw)); } catch { /* ignore malformed data */ }
    }
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Live coaching: request suggestions when prospect speaks
  useEffect(() => {
    if (status !== "connected" || transcript.length === 0) return;

    const lastEntry = transcript[transcript.length - 1];
    if (lastEntry.speaker !== "prospect") return;

    // Debounce: wait 2 seconds after last prospect message
    if (coachDebounceRef.current) clearTimeout(coachDebounceRef.current);

    coachDebounceRef.current = setTimeout(async () => {
      setIsCoaching(true);
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcriptRef.current,
            persona_id: persona.id,
            rep_profile: repProfile ?? undefined,
          }),
        });
        if (res.ok) {
          const suggestion = await res.json();
          suggestionIdRef.current += 1;
          setLiveSuggestions((prev) =>
            [{ ...suggestion, id: suggestionIdRef.current }, ...prev].slice(0, 5)
          );
        }
      } catch (err) {
        console.error("Coaching error:", err);
      } finally {
        setIsCoaching(false);
      }
    }, 2000);

    return () => {
      if (coachDebounceRef.current) clearTimeout(coachDebounceRef.current);
    };
  }, [transcript, status, persona.id]);

  const startCall = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    setLiveSuggestions([]);

    try {
      // Request mic permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from our server (POST so we can include the rep profile)
      const urlRes = await fetch("/api/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: persona.id, rep_profile: repProfile ?? undefined }),
      });
      if (!urlRes.ok) {
        throw new Error("Failed to get conversation URL");
      }
      const { signed_url } = await urlRes.json();

      // Start ElevenLabs conversation (persona ID already stored server-side via /api/signed-url)
      const conversation = await Conversation.startSession({
        signedUrl: signed_url,
        onConnect: () => {
          setStatus("connected");
          startTimeRef.current = Date.now();

          // Start timer
          timerRef.current = setInterval(() => {
            setDuration(
              Math.floor((Date.now() - startTimeRef.current) / 1000)
            );
          }, 1000);
        },
        onDisconnect: (details: unknown) => {
          console.error("ElevenLabs disconnected:", JSON.stringify(details));
          setStatus("disconnected");
          if (timerRef.current) clearInterval(timerRef.current);
        },
        onMessage: (message: { source?: string; message?: string; role?: string }) => {
          if (message.message) {
            const entry: TranscriptEntry = {
              speaker: message.source === "ai" || message.role === "agent" ? "prospect" : "rep",
              text: message.message,
              timestamp: Date.now() - startTimeRef.current,
            };
            setTranscript((prev) => [...prev, entry]);
          }
        },
        onError: (message: string, context?: unknown) => {
          console.error("ElevenLabs error:", message, context);
          setError(message || "Connection error");
        },
        onStatusChange: ({ status: newStatus }: { status: string }) => {
          console.log("ElevenLabs status:", newStatus);
        },
        onDebug: (info: unknown) => {
          console.log("ElevenLabs debug:", info);
        },
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error("Failed to start call:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start call. Check your microphone permissions."
      );
      setStatus("idle");
    }
  }, [repProfile]);

  const endCall = useCallback(async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession();
      conversationRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setStatus("disconnected");
    setIsSaving(true);

    try {
      // Score the call
      const scoreRes = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptRef.current,
          persona_id: persona.id,
          rep_profile: repProfile ?? undefined,
        }),
      });

      let score: ScoreResult | null = null;
      if (scoreRes.ok) {
        score = await scoreRes.json();
      }

      // Save session
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rep_name: repName,
          persona_id: persona.id,
          transcript: transcriptRef.current,
          score,
          duration_seconds: Math.floor(
            (Date.now() - startTimeRef.current) / 1000
          ),
        }),
      });

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        router.push(`/results/${session.id}`);
      } else {
        setError("Failed to save session");
        setIsSaving(false);
      }
    } catch (err) {
      console.error("Error saving session:", err);
      setError("Failed to save call results");
      setIsSaving(false);
    }
  }, [persona.id, repName, router, repProfile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (conversationRef.current) {
        conversationRef.current.endSession();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full max-w-5xl mx-auto p-4">
      {/* Coaching sidebar — desktop only */}
      <div className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-16">
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <CoachingSidebar
              persona={persona}
              liveSuggestions={liveSuggestions}
              isCoaching={isCoaching}
            />
          </ScrollArea>
        </div>
      </div>

      {/* Main call area */}
      <div className="flex flex-col gap-4 flex-1 min-w-0">
      {/* Persona info */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Calling</p>
              <p className="font-semibold text-lg">{persona.name}</p>
              <p className="text-sm text-muted-foreground">{persona.title}</p>
            </div>
            <Badge variant="outline" className={`text-xs shrink-0 ${
              persona.difficulty === "easy"
                ? "border-green-500/50 text-green-400"
                : persona.difficulty === "medium"
                  ? "border-yellow-500/50 text-yellow-400"
                  : "border-red-500/50 text-red-400"
            }`}>
              {persona.difficulty}
            </Badge>
          </div>
          <div className="border-t border-border/30 pt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Their number</p>
              <p className="font-mono font-medium">{deriveProspectNumber(persona.id, persona.company)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Their network</p>
              <p>{persona.company.replace(/^Current provider:\s*/i, "")}</p>
            </div>
            {repProfile?.callerNumber && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">You are calling from</p>
                <p className="font-mono font-medium">{repProfile.callerNumber}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timer */}
      <div className="text-center">
        <p className="text-4xl font-mono font-light tracking-wider">
          {formatTime(duration)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {status === "idle" && "Ready to call"}
          {status === "connecting" && "Connecting..."}
          {status === "connected" && "Call in progress"}
          {status === "disconnected" && (isSaving ? "Scoring your call..." : "Call ended")}
        </p>
      </div>

      {/* Audio visualizer */}
      <AudioVisualizer
        getInputByteFrequencyData={() =>
          conversationRef.current?.getInputByteFrequencyData() ?? null
        }
        getOutputByteFrequencyData={() =>
          conversationRef.current?.getOutputByteFrequencyData() ?? null
        }
        isActive={status === "connected"}
      />

      {/* Call controls */}
      <div className="flex justify-center">
        {status === "idle" ? (
          <Button
            size="lg"
            onClick={startCall}
            className="w-20 h-20 rounded-full bg-green-600 hover:bg-green-700 text-white text-lg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8"
            >
              <path
                fillRule="evenodd"
                d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        ) : status === "connecting" ? (
          <Button
            size="lg"
            disabled
            className="w-20 h-20 rounded-full bg-yellow-600 text-white"
          >
            <svg
              className="w-8 h-8 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </Button>
        ) : status === "connected" ? (
          <Button
            size="lg"
            onClick={endCall}
            className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8"
            >
              <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 00-2.631-4.31l-3.099 3.099a7.5 7.5 0 013.801 3.282.75.75 0 001.929-2.071zm-9.176 5.38a3.75 3.75 0 01-5.061-1.06L5.47 19.842A7.5 7.5 0 0013.5 17.933z" />
            </svg>
          </Button>
        ) : null}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          {status === "disconnected" && !isSaving && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus("idle");
                setError(null);
                setTranscript([]);
                setDuration(0);
              }}
              className="mt-2"
            >
              Try Again
            </Button>
          )}
        </div>
      )}

      {/* Live transcript */}
      {transcript.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-0">
            <div className="p-3 border-b border-border/50">
              <p className="text-sm font-medium">Live Transcript</p>
            </div>
            <ScrollArea className="h-[300px]">
              <div ref={scrollRef} className="p-3 space-y-3">
                {transcript.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${
                      entry.speaker === "rep" ? "items-end" : "items-start"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground mb-1">
                      {entry.speaker === "rep" ? "You" : persona.name}
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
      </div>
    </div>
  );
}
