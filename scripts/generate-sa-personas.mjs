const BASE = "http://localhost:3000";

const personas = [
  {
    description: `A 27-year-old Black South African man named Thabo Mokoena living in Soweto.
He works as a delivery driver for a food app and relies heavily on mobile data.
He is currently on MTN prepaid and spends around R150 a month on ad-hoc data bundles —
no contract, no commitment. He is friendly and open to a chat but needs a deal that is
clearly better value than what he buys now. He will switch if the numbers make sense.
Use South African township slang naturally ("eish", "sharp sharp", "yebo").
He refers to money in Rands.`,
    difficulty: "easy",
  },
  {
    description: `A 38-year-old South African Indian man named Ravi Naidoo based in Durban.
He is an accountant at a mid-sized firm. His Vodacom contract expires in 6 weeks and he
has been meaning to shop around. He is polite but busy — he does not like unsolicited calls
and will say so early. However, if the agent is professional and gets to the point quickly
he will listen. He cares about value for money and network reliability (he travels between
Durban and Joburg monthly). He refers to money in Rands.`,
    difficulty: "medium",
  },
  {
    description: `A 61-year-old Afrikaans South African man named Piet van der Merwe who runs
a smallholding outside Pretoria. He has been a Cell C customer for 14 years and is proud of
his loyalty. He is deeply suspicious of cold callers — he has been caught by hidden fees and
contract traps before and will bring this up. He is gruff, uses Afrikaans expressions naturally
("ag man", "jammer", "lekker"), and will challenge every claim the agent makes.
He is not rude but he is tough. He will only consider switching if the agent is completely
transparent about costs and earns his trust step by step. He refers to money in Rands.`,
    difficulty: "hard",
  },
];

for (const { description, difficulty } of personas) {
  console.log(`\nGenerating ${difficulty} persona...`);

  const genRes = await fetch(`${BASE}/api/personas/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, difficulty }),
  });
  if (!genRes.ok) {
    console.error("Generate failed:", await genRes.text());
    continue;
  }
  const persona = await genRes.json();
  console.log(`  Generated: ${persona.name} — ${persona.disposition}`);

  const saveRes = await fetch(`${BASE}/api/personas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persona),
  });
  if (!saveRes.ok) {
    console.error("Save failed:", await saveRes.text());
    continue;
  }
  const saved = await saveRes.json();
  console.log(`  Saved with id: ${saved.id}`);
}

console.log("\nDone.");
