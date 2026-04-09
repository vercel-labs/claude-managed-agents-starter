import { getAnthropic } from "./anthropic";

export function getManagedAgentConfig(): {
  agentId: string;
  environmentId: string;
} {
  const agentId = process.env.ANTHROPIC_AGENT_ID?.trim();
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID?.trim();
  if (!agentId || !environmentId) {
    throw new Error(
      "ANTHROPIC_AGENT_ID and ANTHROPIC_ENVIRONMENT_ID must be set to create managed agent sessions",
    );
  }
  return { agentId, environmentId };
}

export async function createCodingSession(vaultIds: string[]) {
  const client = getAnthropic();
  const { agentId, environmentId } = getManagedAgentConfig();

  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    vault_ids: vaultIds,
  });
  return {
    anthropicSessionId: session.id,
    agentId: session.agent.id,
    environmentId: session.environment_id,
  };
}

export async function sendUserMessage(
  anthropicSessionId: string,
  text: string,
) {
  const client = getAnthropic();
  await client.beta.sessions.events.send(anthropicSessionId, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text }],
      },
    ],
  });
}
