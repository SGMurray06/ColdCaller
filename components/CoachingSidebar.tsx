"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Persona, CoachingTip } from "@/lib/db";
import type { CoachSuggestion } from "@/app/api/coach/route";

export interface LiveSuggestion extends CoachSuggestion {
  id: number;
}

interface CoachingSidebarProps {
  persona: Persona;
  liveSuggestions: LiveSuggestion[];
  isCoaching: boolean;
}

const phaseLabels: Record<CoachingTip["phase"], string> = {
  opener: "Opening",
  discovery: "Discovery",
  objection: "Objections",
  close: "Closing",
};

const phaseColors: Record<CoachingTip["phase"], string> = {
  opener: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  discovery: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  objection: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  close: "bg-green-500/20 text-green-300 border-green-500/30",
};

export function CoachingSidebar({
  persona,
  liveSuggestions,
  isCoaching,
}: CoachingSidebarProps) {
  const phases: CoachingTip["phase"][] = ["opener", "discovery", "objection", "close"];
  const grouped = phases
    .map((phase) => ({
      phase,
      tips: persona.coachingTips.filter((t) => t.phase === phase),
    }))
    .filter((g) => g.tips.length > 0);

  return (
    <div className="space-y-3">
      {/* Live coaching section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Live Coach</h3>
          {isCoaching && (
            <span className="flex items-center gap-1.5 text-[10px] text-cyan-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
              </span>
              thinking...
            </span>
          )}
        </div>

        {liveSuggestions.length === 0 && !isCoaching ? (
          <Card className="bg-card/20 border-border/20 border-dashed">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground/50 text-center">
                Suggestions will appear here as the call progresses
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {liveSuggestions.map((suggestion, i) => (
              <Card
                key={suggestion.id}
                className={`border transition-all duration-300 ${
                  i === 0
                    ? "bg-cyan-500/10 border-cyan-500/30 shadow-lg shadow-cyan-500/5"
                    : "bg-card/30 border-border/30 opacity-60"
                }`}
              >
                <CardContent className="p-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] mb-1.5 ${phaseColors[suggestion.phase]}`}
                  >
                    {phaseLabels[suggestion.phase]}
                  </Badge>
                  <p className={`text-xs font-medium leading-relaxed ${i === 0 ? "text-cyan-100" : ""}`}>
                    &ldquo;{suggestion.suggestion}&rdquo;
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {suggestion.why}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator className="border-border/20" />

      {/* Static sections below */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Quick Reference</h3>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            persona.difficulty === "easy"
              ? "border-green-500/50 text-green-400"
              : persona.difficulty === "medium"
                ? "border-yellow-500/50 text-yellow-400"
                : "border-red-500/50 text-red-400"
          }`}
        >
          {persona.difficulty}
        </Badge>
      </div>

      {/* Win condition */}
      <Card className="bg-green-500/5 border-green-500/20">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-green-400/70 mb-1">
            Goal
          </p>
          <p className="text-xs text-green-200/80">{persona.winCondition}</p>
        </CardContent>
      </Card>

      {/* Tips by phase */}
      {grouped.map(({ phase, tips }) => (
        <div key={phase}>
          <Badge
            variant="outline"
            className={`text-[10px] mb-2 ${phaseColors[phase]}`}
          >
            {phaseLabels[phase]}
          </Badge>
          <div className="space-y-2">
            {tips.map((tip, i) => (
              <Card key={i} className="bg-card/30 border-border/30">
                <CardContent className="p-2.5">
                  <p className="text-xs font-medium mb-0.5">{tip.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {tip.tip}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Likely objections */}
      <div>
        <Badge
          variant="outline"
          className="text-[10px] mb-2 bg-red-500/10 text-red-300 border-red-500/30"
        >
          Expect These Objections
        </Badge>
        <div className="space-y-1">
          {persona.objections.map((obj, i) => (
            <p key={i} className="text-xs text-muted-foreground/70 pl-2 border-l border-red-500/20">
              &ldquo;{obj}&rdquo;
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
