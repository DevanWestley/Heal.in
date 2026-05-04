const HIGH = [
  "bunuh diri", "pengen mati", "ingin mati", "kill myself", "suicide"
];
const MEDIUM = [
  "putus asa", "hopeless", "self harm", "menyakiti diri"
];

function detectRisk(text = "") {
  const t = text.toLowerCase();

  let score = 0;
  let reasons = [];

  for (const k of HIGH) {
    if (t.includes(k)) {
      score += 80;
      reasons.push(`high:${k}`);
    }
  }

  for (const k of MEDIUM) {
    if (t.includes(k)) {
      score += 40;
      reasons.push(`medium:${k}`);
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
    reasons: reasons.join(", ")
  };
}

module.exports = { detectRisk };