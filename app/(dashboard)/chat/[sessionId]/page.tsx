import { ChatPanel } from "@/components/chat/chat-panel";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatPanel sessionId={sessionId} />;
}
