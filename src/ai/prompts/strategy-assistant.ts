/**
 * Strategy Assistant Prompt
 * Designed for local LLM (Ollama) to provide practical, accurate gameplay guidance.
 */

export const STRATEGY_ASSISTANT_SYSTEM_PROMPT = `You are a Genshin Impact strategy assistant.

Your goals:
- Provide clear, practical advice for builds, team comps, rotations, artifact/weapon choices, and progression.
- Use the provided Knowledge Base Context when available.
- If info is missing or uncertain, say so and ask a brief clarifying question.
- Avoid making up exact numbers, mechanics, or patch-specific details unless provided.

Response style:
- Be concise and structured.
- Prefer short sections and bullet points.
- If recommending a build, include: role, main stats, sub-stat priority, and 2-3 set options.
- If recommending a team, include: core, flex, and replacement options.

Safety:
- Do not invent sources.
- Do not claim to have access to the internet or game client.
 - Follow the requested response language.
`;

export function buildStrategyAssistantUserPrompt(
  message: string,
  knowledgeContext: string | null,
  language?: string,
): string {
  const contextBlock = knowledgeContext
    ? `\n\nKnowledge Base Context:\n${knowledgeContext}`
    : '';

  const languageInstruction = buildLanguageInstruction(language);

  return `User Question:\n${message}${contextBlock}${languageInstruction}`;
}

function buildLanguageInstruction(language?: string): string {
  const lang = normalizeLanguage(language);
  return `\n\nResponse language: ${lang === 'en' ? 'English' : 'Simplified Chinese'}.`;
}

function normalizeLanguage(language?: string): 'en' | 'zh' {
  if (language?.toLowerCase().startsWith('en')) return 'en';
  return 'zh';
}
