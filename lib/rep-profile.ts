export type ExperienceLevel = "new" | "intermediate" | "experienced";
export type ContractType = "Prepaid" | "Postpaid" | "SIM-only";
export type TrainingFocus = "Opening" | "Objection handling" | "Closing" | "General";

export interface RepProfile {
  companyName: string;
  repRole: string;
  experienceLevel: ExperienceLevel;
  planName: string;
  contractType: ContractType;
  dataAllowance: string;
  voice: string;
  sms: string;
  monthlyPrice: string;
  contractLength: string;
  currentPromotion: string;
  keySellingPoints: string;
  trainingFocus: TrainingFocus;
}

export const EMPTY_PROFILE: RepProfile = {
  companyName: "",
  repRole: "Outbound Sales Agent",
  experienceLevel: "new",
  planName: "",
  contractType: "Postpaid",
  dataAllowance: "",
  voice: "",
  sms: "",
  monthlyPrice: "",
  contractLength: "",
  currentPromotion: "",
  keySellingPoints: "",
  trainingFocus: "General",
};

export function buildRepContextBlock(profile: RepProfile): string {
  const lines = [
    `--- CALL CONTEXT ---`,
    `You are being cold-called by a ${profile.repRole} from ${profile.companyName}.`,
    `They are pitching: ${profile.planName} (${profile.contractType}, ${profile.contractLength})`,
    `- Data: ${profile.dataAllowance}`,
    `- Voice: ${profile.voice}`,
  ];
  if (profile.sms) lines.push(`- SMS: ${profile.sms}`);
  lines.push(`- Monthly cost: ${profile.monthlyPrice}`);
  if (profile.currentPromotion) lines.push(`- Current offer: ${profile.currentPromotion}`);
  if (profile.keySellingPoints) lines.push(`- Their pitch: ${profile.keySellingPoints}`);
  lines.push(`React to this specific offer as your character would.`);
  lines.push(`--- END CALL CONTEXT ---`);
  return lines.join("\n");
}
