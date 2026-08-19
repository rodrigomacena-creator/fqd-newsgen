import OpenAI from "openai";

export const OPENROUTER_TEXT_MODEL =
  process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.5-flash-lite";

export const OPENROUTER_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image";

export function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY não configurada. Adicione sua chave no arquivo .env."
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Portal de Notícias IA",
    },
  });
}

/**
 * OpenRouter sometimes responds with HTTP 200 but an `{ error }` body instead
 * of `choices` (e.g. the upstream provider's safety filter blocked the
 * request) — the OpenAI SDK doesn't throw for that shape, so callers must not
 * index into `completion.choices[0]` directly or it crashes with a useless
 * "Cannot read properties of undefined" instead of the real reason.
 */
export function extractCompletionText(completion: unknown): string {
  const c = completion as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };

  const content = c?.choices?.[0]?.message?.content;
  if (content) return content;

  if (c?.error?.message) {
    throw new Error(`A IA recusou a solicitação: ${c.error.message}`);
  }

  throw new Error("O modelo de IA não retornou nenhum conteúdo.");
}
