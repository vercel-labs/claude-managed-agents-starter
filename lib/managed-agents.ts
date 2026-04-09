import { getAnthropic } from "./anthropic";

interface MCPServerDef {
  name: string;
  url: string;
}

const REQUIRED_MCP_SERVERS: MCPServerDef[] = [
  { name: "github", url: "https://api.githubcopilot.com/mcp/" },
  { name: "notion", url: "https://mcp.notion.com/mcp" },
  { name: "slack", url: "https://mcp.slack.com/mcp" },
];

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

export async function ensureAgentMCPs(): Promise<void> {
  const client = getAnthropic();
  const { agentId } = getManagedAgentConfig();
  const agent = await client.beta.agents.retrieve(agentId);

  const existingServerNames = new Set(agent.mcp_servers.map((s) => s.name));
  const missingServers = REQUIRED_MCP_SERVERS.filter(
    (s) => !existingServerNames.has(s.name),
  );

  const toolsNeedingUpdate = REQUIRED_MCP_SERVERS.filter((s) => {
    const toolset = agent.tools.find(
      (t): t is Extract<typeof t, { type: "mcp_toolset" }> =>
        t.type === "mcp_toolset" && t.mcp_server_name === s.name,
    );
    if (!toolset) return true;
    return toolset.default_config.permission_policy?.type !== "always_allow";
  });

  if (missingServers.length === 0 && toolsNeedingUpdate.length === 0) return;

  type ToolParam = NonNullable<
    Parameters<typeof client.beta.agents.update>[1]["tools"]
  >[number];

  const mcp_servers =
    missingServers.length === 0
      ? undefined
      : [
          ...agent.mcp_servers.map((s) => ({
            name: s.name,
            type: "url" as const,
            url: s.url,
          })),
          ...missingServers.map((s) => ({
            name: s.name,
            type: "url" as const,
            url: s.url,
          })),
        ];

  const requiredNames = new Set(REQUIRED_MCP_SERVERS.map((s) => s.name));
  const tools =
    toolsNeedingUpdate.length === 0
      ? undefined
      : [
          ...agent.tools
            .filter(
              (t) =>
                !(
                  t.type === "mcp_toolset" &&
                  requiredNames.has(t.mcp_server_name)
                ),
            )
            .map((t): ToolParam => {
              switch (t.type) {
                case "mcp_toolset":
                  return {
                    type: "mcp_toolset" as const,
                    mcp_server_name: t.mcp_server_name,
                    default_config: { enabled: t.default_config.enabled },
                  };
                case "custom":
                  return {
                    type: "custom" as const,
                    name: t.name,
                    description: t.description,
                    input_schema: t.input_schema,
                  };
                case "agent_toolset_20260401":
                  return { type: "agent_toolset_20260401" as const };
              }
            }),
          ...REQUIRED_MCP_SERVERS.map((s) => ({
            type: "mcp_toolset" as const,
            mcp_server_name: s.name,
            default_config: {
              enabled: true,
              permission_policy: { type: "always_allow" as const },
            },
          })),
        ];

  await client.beta.agents.update(agentId, {
    version: agent.version,
    ...(mcp_servers && { mcp_servers }),
    ...(tools && { tools }),
  });
}

export async function createAnthropicManagedSession() {
  const client = getAnthropic();
  const { agentId, environmentId } = getManagedAgentConfig();
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
  });
  return {
    anthropicSessionId: session.id,
    agentId: session.agent.id,
    environmentId: session.environment_id,
  };
}

export async function createCodingSession(vaultIds: string[]) {
  const client = getAnthropic();
  const { agentId, environmentId } = getManagedAgentConfig();

  await ensureAgentMCPs();

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
