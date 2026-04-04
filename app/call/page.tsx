"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CallInterface } from "@/components/CallInterface";
import { getPersona } from "@/lib/personas";
import type { Persona } from "@/lib/personas";
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

    const found = getPersona(personaId);
    if (!found) {
      router.push("/");
      return;
    }

    setPersona(found);
    setRepName(name);
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
