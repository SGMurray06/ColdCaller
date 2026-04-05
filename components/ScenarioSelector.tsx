"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Persona } from "@/lib/db";

interface ScenarioSelectorProps {
  personas: Persona[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function ScenarioSelector({
  personas,
  selected,
  onSelect,
}: ScenarioSelectorProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {personas.map((persona) => (
        <Card
          key={persona.id}
          onClick={() => onSelect(persona.id)}
          className={`cursor-pointer transition-all hover:border-primary/50 ${
            selected === persona.id
              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
              : "border-border/50 bg-card/50"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold">{persona.name}</h3>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${
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
            <p className="text-sm text-muted-foreground mb-1">
              {persona.title}
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              {persona.company}
            </p>
            <p className="text-xs text-muted-foreground/70 line-clamp-2">
              {persona.disposition}
            </p>
            <div className="mt-3 pt-3 border-t border-border/30">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">
                Win condition
              </p>
              <p className="text-xs text-muted-foreground/70 line-clamp-2">
                {persona.winCondition}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
