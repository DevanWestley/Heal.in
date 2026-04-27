const HIGH = [
  "bunuh diri", "pengen mati", "ingin mati", "kill myself", "suicide"
];
const MEDIUM = [
  "putus asa", "hopeless", "self harm", "menyakiti diri"
];

function detectRisk(text = "") {
  const t = text.toLowerCase();

  let score = 0;
  let reason = [];

  for (const k of HIGH) {
    if (t.includes(k)) {
      score += 80;
      reason.push(`high:${k}`);
    }
  }

  for (const k of MEDIUM) {
    if (t.includes(k)) {
      score += 40;
      reason.push(`medium:${k}`);
    }
  }

  let level = null;
  if (score >= 80) level = "high";
  else if (score >= 40) level = "medium";
  else if (score > 0) level = "low";

  return {
    flagged: level !== null,
    level,
    score,
    reason: reason.join(", ")
  };
}

module.exports = { detectRisk };