import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";

import type { Environment } from "../config/environment.js";
import type { GroqChatClient, GroqCompletionCreateRequest } from "./groq-structured-extractor.js";

export const createGroqClient = (environment: Environment): GroqChatClient => {
  const client = new Groq({
    apiKey: environment.groqApiKey,
    maxRetries: environment.groqMaxRetries,
    timeout: environment.groqTimeoutMs,
  });

  return {
    chat: {
      completions: {
        create: async (request: GroqCompletionCreateRequest): Promise<ChatCompletion> =>
          client.chat.completions.create(request as ChatCompletionCreateParamsNonStreaming),
      },
    },
  };
};
