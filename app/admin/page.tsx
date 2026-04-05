"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Persona } from "@/lib/db";

export default function AdminPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateDesc, setGenerateDesc] = useState("");
  const [generateDifficulty, setGenerateDifficulty] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [generatedPersona, setGeneratedPersona] = useState<Persona | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchPersonas() {
    try {
      const res = await fetch("/api/personas");
      if (res.ok) setPersonas(await res.json());
    } catch (err) {
      console.error("Failed to fetch personas:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPersonas();
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete persona "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/personas?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setPersonas((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  async function handleSaveEdit() {
    if (!editingPersona) return;
    setSaving(true);
    try {
      const res = await fetch("/api/personas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPersona),
      });
      if (res.ok) {
        await fetchPersonas();
        setEditingPersona(null);
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!generateDesc.trim()) return;
    setGenerating(true);
    setGeneratedPersona(null);
    try {
      const res = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: generateDesc,
          difficulty: generateDifficulty,
        }),
      });
      if (res.ok) {
        setGeneratedPersona(await res.json());
      }
    } catch (err) {
      console.error("Failed to generate:", err);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveGenerated() {
    if (!generatedPersona) return;
    setSaving(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generatedPersona),
      });
      if (res.ok) {
        await fetchPersonas();
        setShowGenerate(false);
        setGeneratedPersona(null);
        setGenerateDesc("");
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }

  const difficultyColor = (d: string) =>
    d === "easy"
      ? "border-green-500/50 text-green-400"
      : d === "medium"
        ? "border-yellow-500/50 text-yellow-400"
        : "border-red-500/50 text-red-400";

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manage Prospects</h1>
            <p className="text-muted-foreground text-sm">
              Add, edit, or generate AI personas
            </p>
          </div>
          <Button onClick={() => setShowGenerate(true)}>
            AI Generate
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="space-y-3">
            {personas.map((persona) => (
              <Card key={persona.id} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{persona.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${difficultyColor(persona.difficulty)}`}
                        >
                          {persona.difficulty}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {persona.title} &mdash; {persona.company}
                      </p>
                      <p className="text-xs text-muted-foreground/70 line-clamp-1">
                        {persona.disposition}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingPersona({ ...persona })}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(persona.id, persona.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog
          open={!!editingPersona}
          onOpenChange={(open) => !open && setEditingPersona(null)}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {editingPersona && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Edit Persona</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      value={editingPersona.name}
                      onChange={(e) =>
                        setEditingPersona({ ...editingPersona, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Title</label>
                    <Input
                      value={editingPersona.title}
                      onChange={(e) =>
                        setEditingPersona({ ...editingPersona, title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Company</label>
                    <Input
                      value={editingPersona.company}
                      onChange={(e) =>
                        setEditingPersona({ ...editingPersona, company: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Difficulty</label>
                    <select
                      value={editingPersona.difficulty}
                      onChange={(e) =>
                        setEditingPersona({
                          ...editingPersona,
                          difficulty: e.target.value as "easy" | "medium" | "hard",
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Disposition</label>
                  <textarea
                    value={editingPersona.disposition}
                    onChange={(e) =>
                      setEditingPersona({ ...editingPersona, disposition: e.target.value })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">First Message</label>
                  <Input
                    value={editingPersona.firstMessage}
                    onChange={(e) =>
                      setEditingPersona({ ...editingPersona, firstMessage: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Win Condition</label>
                  <textarea
                    value={editingPersona.winCondition}
                    onChange={(e) =>
                      setEditingPersona({ ...editingPersona, winCondition: e.target.value })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    System Prompt
                  </label>
                  <textarea
                    value={editingPersona.systemPrompt}
                    onChange={(e) =>
                      setEditingPersona({ ...editingPersona, systemPrompt: e.target.value })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[200px]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingPersona(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* AI Generate Dialog */}
        <Dialog
          open={showGenerate}
          onOpenChange={(open) => {
            if (!open) {
              setShowGenerate(false);
              setGeneratedPersona(null);
              setGenerateDesc("");
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">AI Generate Persona</h2>
              <p className="text-sm text-muted-foreground">
                Describe the type of prospect you want and Claude will generate a
                full persona with system prompt, objections, and coaching tips.
              </p>

              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <textarea
                  value={generateDesc}
                  onChange={(e) => setGenerateDesc(e.target.value)}
                  placeholder="e.g., An elderly retiree who is very chatty and lonely, loves talking on the phone, but is suspicious of scams..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Difficulty</label>
                <select
                  value={generateDifficulty}
                  onChange={(e) => setGenerateDifficulty(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !generateDesc.trim()}
                className="w-full"
              >
                {generating ? "Generating..." : "Generate Persona"}
              </Button>

              {generatedPersona && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Generated Persona</h3>
                    <Card className="bg-card/50 border-border/50">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{generatedPersona.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${difficultyColor(generatedPersona.difficulty)}`}
                          >
                            {generatedPersona.difficulty}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {generatedPersona.title} &mdash; {generatedPersona.company}
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          {generatedPersona.disposition}
                        </p>
                        <Separator className="border-border/30" />
                        <p className="text-xs">
                          <span className="text-muted-foreground">First message:</span>{" "}
                          &ldquo;{generatedPersona.firstMessage}&rdquo;
                        </p>
                        <p className="text-xs">
                          <span className="text-muted-foreground">Win condition:</span>{" "}
                          {generatedPersona.winCondition}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {generatedPersona.objections.length} objections,{" "}
                          {generatedPersona.coachingTips.length} coaching tips
                        </p>
                      </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setGeneratedPersona(null)}
                      >
                        Discard
                      </Button>
                      <Button onClick={handleSaveGenerated} disabled={saving}>
                        {saving ? "Saving..." : "Save to Database"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
