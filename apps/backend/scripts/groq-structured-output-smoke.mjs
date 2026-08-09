import { fileURLToPath } from "node:url";

import { config as loadEnvironmentFile } from "dotenv";
import Groq from "groq-sdk";

loadEnvironmentFile({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";

if (apiKey === undefined || apiKey.length === 0) {
  process.stderr.write("GROQ_API_KEY is required in the root .env file.\n");
  process.exitCode = 1;
} else {
  const client = new Groq({
    apiKey,
    maxRetries: 0,
    timeout: 30_000,
  });

  try {
    const completion = await client.chat.completions.create({
      max_completion_tokens: 128,
      messages: [
        {
          role: "system",
          content: "Return the requested value using the supplied JSON schema.",
        },
        {
          role: "user",
          content: "Set value to provider-smoke-ok.",
        },
      ],
      model,
      response_format: {
        json_schema: {
          name: "docella_provider_smoke",
          schema: {
            additionalProperties: false,
            properties: {
              value: { type: "string" },
            },
            required: ["value"],
            type: "object",
          },
          strict: true,
        },
        type: "json_schema",
      },
      stream: false,
      temperature: 0,
    });

    const content = completion.choices[0]?.message.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (parsed?.value !== "provider-smoke-ok") {
      throw new Error("Provider returned an unexpected structured response.");
    }

    process.stdout.write(`${JSON.stringify({ model, ok: true })}\n`);
  } catch (error) {
    const record = typeof error === "object" && error !== null ? error : {};
    const body =
      typeof record.error === "object" && record.error !== null ? record.error : undefined;
    const providerError =
      body !== undefined && typeof body.error === "object" && body.error !== null
        ? body.error
        : body;
    const diagnostic = {
      code:
        providerError !== undefined && typeof providerError.code === "string"
          ? providerError.code
          : undefined,
      message:
        providerError !== undefined && typeof providerError.message === "string"
          ? providerError.message.slice(0, 320)
          : error instanceof Error
            ? error.message.slice(0, 320)
            : "Unknown provider error",
      model,
      ok: false,
      status: typeof record.status === "number" ? record.status : undefined,
      type:
        providerError !== undefined && typeof providerError.type === "string"
          ? providerError.type
          : undefined,
    };

    process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
    process.exitCode = 1;
  }
}
