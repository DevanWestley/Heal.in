// Very simple rule-based detector for MVP.
// Returns { level, score, reasons[] } or null if safe.
function detectRisk(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();

  let score = 0;
  const reasons = [];

  const rules = [
    { kw: "bunuh diri", add: 80 },
    { kw: "pengen mati", add: 80 },
    { kw: "self harm", add: 70 },
    { kw: "putus asa", add: 30 },
    { kw: "capek", add: 20 },
    { kw: "cemas", add: 20 }
  ];

  for (const r of rules) {
    if (t.includes(r.kw)) {
      score += r.add;
      reasons.push(r.kw);
    }
  }

  if (score <= 0) return null;
  if (score > 100) score = 100;

  const level = score >= 80 ? "high" : score >= 40 ? "medium" : "low";
  return { level, score, reasons };
}

module.exports = { detectRisk };