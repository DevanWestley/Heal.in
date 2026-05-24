const { GoogleGenerativeAI } = require("@google/generative-ai");

const TOPIC_OPTIONS = [
  "Anxiety",
  "Depression",
  "Stress",
  "Relationship",
  "Academic Pressure",
  "Family",
  "Self-Esteem",
  "Trauma",
  "Other",
];

async function summarizeSession(messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  if (!messages || messages.length === 0) throw new Error("No messages to summarize");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const transcript = messages
    .map((m) => `[${m.sender.toUpperCase()}]: ${m.body}`)
    .join("\n");

  const prompt = `Berikut adalah transkrip sesi konseling kesehatan mental anonim:

---
${transcript}
---

Tugas kamu:
1. Buat ringkasan singkat sesi ini dalam 2-3 kalimat bahasa Indonesia, fokus pada isu utama yang dibahas.
2. Klasifikasikan topik utama sesi ke SALAH SATU dari: ${TOPIC_OPTIONS.join(", ")}.
3. Tentukan tingkat risiko keseluruhan sesi: "none", "low", "medium", atau "high".

Balas HANYA dalam format JSON berikut (tanpa markdown, tanpa komentar):
{
  "summary": "...",
  "topic": "...",
  "risk_level": "..."
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown code blocks jika ada
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const parsed = JSON.parse(cleaned);

  return {
    summary: String(parsed.summary ?? ""),
    topic: TOPIC_OPTIONS.includes(parsed.topic) ? parsed.topic : "Other",
    risk_level: ["none", "low", "medium", "high"].includes(parsed.risk_level)
      ? parsed.risk_level
      : "none",
  };
}

module.exports = { summarizeSession };
