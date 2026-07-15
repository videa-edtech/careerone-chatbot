const SCRIPT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Sinhala", pattern: /[\u0D80-\u0DFF]/g },
  { name: "Tamil", pattern: /[\u0B80-\u0BFF]/g },
  { name: "Korean", pattern: /[\uAC00-\uD7AF]/g },
  { name: "Latin-script language", pattern: /[A-Za-z]/g },
];

export function detectUserLanguage(message: string): string {
  let best = { name: "the same language as the user's latest message", count: 0 };

  for (const script of SCRIPT_PATTERNS) {
    const count = message.match(script.pattern)?.length ?? 0;
    if (count > best.count) {
      best = { name: script.name, count };
    }
  }

  if (best.name === "Latin-script language") {
    return "the same Latin-script language used by the user, such as English if the user wrote English";
  }

  return best.name;
}

export function buildLanguageInstruction(message: string): string {
  const language = detectUserLanguage(message);
  return [
    "CRITICAL RESPONSE LANGUAGE RULE:",
    `- The user's latest message language is: ${language}.`,
    "- Respond only in that same language.",
    "- Do not switch to Korean unless the user's latest message is Korean.",
    "- Keep source filenames and quoted source text unchanged.",
  ].join("\n");
}
