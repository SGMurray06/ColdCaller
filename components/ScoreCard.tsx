"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { ScoreResult } from "@/lib/db";

interface ScoreCardProps {
  score: ScoreResult;
  personaName: string;
  duration: number;
}

function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const color =
    value >= 7
      ? "text-green-400"
      : value >= 4
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono font-semibold ${color}`}>{value}/10</span>
      </div>
      <Progress value={value * 10} className="h-2" />
    </div>
  );
}

export function ScoreCard({ score, personaName, duration }: ScoreCardProps) {
  const overallColor =
    score.overall >= 7
      ? "text-green-400 border-green-500/30 bg-green-500/10"
      : score.overall >= 4
        ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
        : "text-red-400 border-red-500/30 bg-red-500/10";

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4 w-full max-w-lg">
      {/* Overall score */}
      <Card className={`border ${overallColor}`}>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">Overall Score</p>
          <p className={`text-6xl font-mono font-bold ${overallColor.split(" ")[0]}`}>
            {score.overall}
          </p>
          <p className="text-sm text-muted-foreground mt-1">/10</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <Badge variant="outline">{personaName}</Badge>
            <Badge variant="outline">{formatTime(duration)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Verdict */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <p className="text-sm italic text-center">&ldquo;{score.verdict}&rdquo;</p>
        </CardContent>
      </Card>

      {/* Score breakdown */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium mb-2">Score Breakdown</p>
          <ScoreBar label="Opener" value={score.opener} />
          <ScoreBar label="Objection Handling" value={score.objection_handling} />
          <ScoreBar label="Value Proposition" value={score.value_proposition} />
          <ScoreBar label="Next Step" value={score.next_step} />
        </CardContent>
      </Card>

      {/* Feedback */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 border-green-500/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-green-400 mb-2">Done Well</p>
            <ul className="space-y-2">
              {score.done_well.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-green-400 shrink-0">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-orange-500/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-orange-400 mb-2">To Improve</p>
            <ul className="space-y-2">
              {score.to_improve.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-orange-400 shrink-0">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
