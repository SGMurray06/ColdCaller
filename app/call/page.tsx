"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CallInterface } from "@/components/CallInterface";
import type { Persona } from "@/lib/db";
import { Suspense } from "react";

function CallPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [repName, setRepName] = useState<string>("");

  useEffect(() => {
    const personaId = searchParams.get("persona");
    const name = localStorage.getItem("coldcaller_rep_name");

    if (!personaId || !name) {
      router.push("/");
      return;
    }

    fetch(`/api/personas?id=${personaId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Persona not found");
        return res.json();
      })
      .then((data) => {
        setPersona(data);
        setRepName(name);
      })
      .catch(() => router.push("/"));
  }, [searchParams, router]);

  if (!persona || !repName) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <CallInterface persona={persona} repName={repName} />
    </main>
  );
}

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <CallPageContent />
    </Suspense>
  );
}
