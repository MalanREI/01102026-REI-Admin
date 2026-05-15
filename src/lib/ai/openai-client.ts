import 'server-only';
import OpenAI from 'openai';

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY env var not set');
  return new OpenAI({ apiKey });
}

export const OPENAI_MODELS = {
  EMBEDDING: 'text-embedding-3-small' as const,
} as const;

export const EMBEDDING_DIMENSIONS = 1536;
