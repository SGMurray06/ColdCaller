"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type RepProfile,
  type ExperienceLevel,
  type ContractType,
  type TrainingFocus,
  EMPTY_PROFILE,
} from "@/lib/rep-profile";

// Generic button-group toggle for enum fields
function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button
          key={opt}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(opt)}
          className={
            value === opt
              ? "ring-2 ring-primary border-primary bg-primary/10"
              : ""
          }
        >
          {opt}
        </Button>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<RepProfile>(EMPTY_PROFILE);
  const [uploading, setUploading] = useState(false);
  const [autoFilled, setAutoFilled] = useState<Set<keyof RepProfile>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem("coldcaller_rep_profile");
    if (raw) {
      try {
        setForm(JSON.parse(raw));
      } catch {
        // ignore malformed data
      }
    }
  }, []);

  const set = <K extends keyof RepProfile>(key: K, value: RepProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear auto-fill indicator when user manually edits a field
    setAutoFilled((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/parse-plan-image", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("Failed to parse image");
      const { fields } = await res.json();
      setForm((prev) => ({ ...prev, ...fields }));
      setAutoFilled(new Set(Object.keys(fields) as (keyof RepProfile)[]));
    } catch {
      setUploadError("Could not extract plan details — fill in manually below.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("coldcaller_rep_profile", JSON.stringify(form));
    router.push("/");
  };

  const inputClass = (key: keyof RepProfile) =>
    autoFilled.has(key) ? "ring-1 ring-green-500/60" : "";

  return (
    <main className="min-h-screen flex flex-col items-center p-4 md:p-8 pb-20">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Rep Profile</h1>
          <p className="text-muted-foreground text-sm">
            This context is injected into every AI prompt so practice calls reflect your real product.
          </p>
        </div>

        {/* Screenshot auto-fill */}
        <Card className="border-dashed border-2 border-border/50 bg-card/30">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && handleImageUpload(e.target.files[0])
                }
              />
              {uploading ? (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Extracting plan details…
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Upload a plan screenshot to auto-fill
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    Claude will extract the plan details — review and edit below
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose screenshot
                  </Button>
                </>
              )}
            </div>
            {autoFilled.size > 0 && !uploading && (
              <p className="text-xs text-green-500 text-center mt-3">
                ✓ {autoFilled.size} fields auto-filled — review and edit below
              </p>
            )}
            {uploadError && (
              <p className="text-xs text-red-400 text-center mt-3">{uploadError}</p>
            )}
          </CardContent>
        </Card>

        {/* Company & Rep */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Company & Rep</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Company name">
              <Input
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="e.g. MTN South Africa"
                className={inputClass("companyName")}
              />
            </Field>
            <Field label="Your role">
              <Input
                value={form.repRole}
                onChange={(e) => set("repRole", e.target.value)}
                placeholder="e.g. Outbound Sales Agent"
                className={inputClass("repRole")}
              />
            </Field>
            <Field label="Experience level">
              <ToggleGroup<ExperienceLevel>
                options={["new", "intermediate", "experienced"]}
                value={form.experienceLevel}
                onChange={(v) => set("experienceLevel", v)}
              />
            </Field>
          </CardContent>
        </Card>

        {/* Product / Offer */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Product / Offer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Plan name">
              <Input
                value={form.planName}
                onChange={(e) => set("planName", e.target.value)}
                placeholder="e.g. Combo Offer"
                className={inputClass("planName")}
              />
            </Field>
            <Field label="Contract type">
              <ToggleGroup<ContractType>
                options={["Prepaid", "Postpaid", "SIM-only"]}
                value={form.contractType}
                onChange={(v) => set("contractType", v)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Data allowance">
                <Input
                  value={form.dataAllowance}
                  onChange={(e) => set("dataAllowance", e.target.value)}
                  placeholder="e.g. 5GB"
                  className={inputClass("dataAllowance")}
                />
              </Field>
              <Field label="Monthly price">
                <Input
                  value={form.monthlyPrice}
                  onChange={(e) => set("monthlyPrice", e.target.value)}
                  placeholder="e.g. R200/month"
                  className={inputClass("monthlyPrice")}
                />
              </Field>
              <Field label="Voice calls">
                <Input
                  value={form.voice}
                  onChange={(e) => set("voice", e.target.value)}
                  placeholder="e.g. Unlimited"
                  className={inputClass("voice")}
                />
              </Field>
              <Field label="SMS">
                <Input
                  value={form.sms}
                  onChange={(e) => set("sms", e.target.value)}
                  placeholder="e.g. 100 SMS"
                  className={inputClass("sms")}
                />
              </Field>
              <Field label="Contract length" className="col-span-2">
                <Input
                  value={form.contractLength}
                  onChange={(e) => set("contractLength", e.target.value)}
                  placeholder="e.g. Month-to-month"
                  className={inputClass("contractLength")}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Promotions & USPs */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Promotions & USPs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Current promotion (optional)">
              <Input
                value={form.currentPromotion}
                onChange={(e) => set("currentPromotion", e.target.value)}
                placeholder="e.g. Free SIM delivery"
                className={inputClass("currentPromotion")}
              />
            </Field>
            <Field label="Key selling points (optional)">
              <Input
                value={form.keySellingPoints}
                onChange={(e) => set("keySellingPoints", e.target.value)}
                placeholder="e.g. Best 5G coverage, no hidden fees"
                className={inputClass("keySellingPoints")}
              />
            </Field>
          </CardContent>
        </Card>

        {/* Training Focus */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Training Focus</CardTitle>
          </CardHeader>
          <CardContent>
            <ToggleGroup<TrainingFocus>
              options={["Opening", "Objection handling", "Closing", "General"]}
              value={form.trainingFocus}
              onChange={(v) => set("trainingFocus", v)}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/")}
          >
            Cancel
          </Button>
          <Button type="submit">Save & Return</Button>
        </div>
      </form>
    </main>
  );
}
