import { getAnthropic } from "./anthropic";

export function getManagedAgentConfig(): { agentId: string; environmentId: string } {
  const agentId = process.env.ANTHROPIC_AGENT_ID?.trim();
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID?.trim();
  if (!agentId || !environmentId) {
    throw new Error(
      "ANTHROPIC_AGENT_ID and ANTHROPIC_ENVIRONMENT_ID must be set to create managed agent sessions",
    );
  }
  return { agentId, environmentId };
}

let _codingEnvironmentId: string | null = null;

export async function getOrCreateCodingEnvironment(): Promise<string> {
  if (_codingEnvironmentId) return _codingEnvironmentId;

  const client = getAnthropic();
  const envName = "coding-agent-env";

  for await (const env of client.beta.environments.list()) {
    if (env.name === envName && !env.archived_at) {
      _codingEnvironmentId = env.id;
      return env.id;
    }
  }

  const env = await client.beta.environments.create({
    name: envName,
    description: "Coding agent with GitHub access, git, and curl",
    config: {
      type: "cloud",
      networking: {
        type: "limited",
        allowed_hosts: ["github.com", "*.github.com", "api.github.com"],
        allow_package_managers: true,
      },
      packages: {
        apt: ["git", "curl", "jq"],
      },
    },
  });

  _codingEnvironmentId = env.id;
  return env.id;
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

export async function createCodingSession() {
  const client = getAnthropic();
  const { agentId } = getManagedAgentConfig();
  const environmentId = await getOrCreateCodingEnvironment();
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

export function buildCodingPreamble(opts: {
  token: string;
  owner: string;
  repo: string;
  baseBranch: string;
  gitName: string;
  gitEmail: string;
}): string {
  const cloneUrl = `https://x-access-token:${opts.token}@github.com/${opts.owner}/${opts.repo}.git`;
  return [
    `<repository_context>`,
    `Repository: ${opts.owner}/${opts.repo}`,
    `Base branch: ${opts.baseBranch}`,
    `Clone URL (includes auth): ${cloneUrl}`,
    ``,
    `Setup instructions (run these first):`,
    `\`\`\`bash`,
    `git clone ${cloneUrl} /home/user/repo`,
    `cd /home/user/repo`,
    `git checkout ${opts.baseBranch}`,
    `git config user.name "${opts.gitName}"`,
    `git config user.email "${opts.gitEmail}"`,
    `\`\`\``,
    ``,
    `Workflow:`,
    `1. Clone the repo and check out the base branch`,
    `2. Create a new branch for your changes: \`git checkout -b <descriptive-branch-name>\``,
    `3. Make the requested code changes`,
    `4. Commit with meaningful messages`,
    `5. Push the branch: \`git push -u origin HEAD\``,
    `6. Create a PR using curl:`,
    `\`\`\`bash`,
    `curl -s -X POST "https://api.github.com/repos/${opts.owner}/${opts.repo}/pulls" \\`,
    `  -H "Authorization: Bearer ${opts.token}" \\`,
    `  -H "Accept: application/vnd.github.v3+json" \\`,
    `  -d '{`,
    `    "title": "<PR title>",`,
    `    "body": "<PR description>",`,
    `    "head": "<your-branch-name>",`,
    `    "base": "${opts.baseBranch}"`,
    `  }'`,
    `\`\`\``,
    ``,
    `Always create a PR after making changes unless explicitly told otherwise.`,
    `</repository_context>`,
  ].join("\n");
}

export async function sendUserMessage(anthropicSessionId: string, text: string) {
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
