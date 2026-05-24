// Risk detection menggunakan HuggingFace Spaces (primary) dengan keyword fallback.

const KEYWORD_RULES = [
  { kw: "bunuh diri", add: 80 },
  { kw: "pengen mati", add: 80 },
  { kw: "mau mati", add: 80 },
  { kw: "tidak mau hidup", add: 75 },
  { kw: "self harm", add: 70 },
  { kw: "menyakiti diri", add: 70 },
  { kw: "ingin mengakhiri", add: 65 },
  { kw: "capek hidup", add: 50 },
  { kw: "putus asa", add: 35 },
  { kw: "tidak ada harapan", add: 35 },
  { kw: "depresi", add: 30 },
  { kw: "cemas", add: 20 },
];

function keywordDetect(text) {
  const t = String(text).toLowerCase();
  let score = 0;
  const reasons = [];
  for (const r of KEYWORD_RULES) {
    if (t.includes(r.kw)) {
      score += r.add;
      reasons.push(r.kw);
    }
  }
  if (score <= 0) return null;
  if (score > 100) score = 100;
  const level = score >= 80 ? "high" : score >= 40 ? "medium" : "low";
  return { level, score, reasons, source: "keyword" };
}

async function spacesDetect(text) {
  const spaceUrl = process.env.HF_SPACE_URL;
  if (!spaceUrl) return null;

  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    const response = await fetch(`${spaceUrl}/detect-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20000),
    });

    // Space sedang cold start — tunggu lalu retry sekali
    if (response.status === 503) {
      if (attempts < 2) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.level || data.level === "none" || data.score <= 0) return null;

    return {
      level: data.level,
      score: data.score,
      reasons: data.reasons ?? [],
      source: "huggingface",
    };
  }

  return null;
}

async function detectRisk(text) {
  if (!text) return null;

  try {
    const result = await spacesDetect(text);
    if (result) return result;
  } catch (e) {
    console.warn("[riskDetection] Spaces unavailable, fallback ke keyword:", e.message?.slice(0, 80));
  }

  return keywordDetect(text);
}

module.exports = { detectRisk };
