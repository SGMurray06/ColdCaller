"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Shared nav for the two admin screens. Without it /admin has no outbound
// links at all, so user management is unreachable unless you know the URL.
const TABS = [
  { href: "/admin", label: "Personas" },
  { href: "/admin/users", label: "Users" },
];

export function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2">
      {TABS.map((tab) => (
        <Button
          key={tab.href}
          size="sm"
          variant={pathname === tab.href ? "default" : "outline"}
          onClick={() => router.push(tab.href)}
        >
          {tab.label}
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => router.push("/")}
      >
        Back to app
      </Button>
    </div>
  );
}
