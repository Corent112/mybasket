import OpenAI from "openai";

export const GROQ_COACH_MODEL = "openai/gpt-oss-120b";
let client: OpenAI | null = null;

export function getGroqCoach() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  client ??= new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1", timeout: 35_000, maxRetries: 0 });
  return client;
}
