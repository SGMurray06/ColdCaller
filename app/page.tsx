import { getAllPersonas } from "@/lib/db";
import { HomeClient } from "@/components/HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const personas = await getAllPersonas();
  return <HomeClient personas={personas} />;
}
