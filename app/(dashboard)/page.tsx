import { getSession } from "@/lib/session";
import { getUserMCPConnections } from "@/lib/mcp-oauth";
import { NewChatComposer } from "./new-chat-composer";

export default async function HomePage() {
  const session = await getSession();
  const viewer = session?.user ?? null;

  const mcpConnections = viewer
    ? await getUserMCPConnections(viewer.id)
    : {};

  return (
    <NewChatComposer
      isAuthenticated={!!viewer}
      mcpConnections={mcpConnections}
    />
  );
}
