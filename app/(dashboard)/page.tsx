import { getSession } from "@/lib/session";
import { NewChatComposer } from "./new-chat-composer";

async function getIsAuthenticated() {
  const session = await getSession();
  return !!session?.user;
}

export default async function HomePage() {
  const isAuthenticated = await getIsAuthenticated();
  return <NewChatComposer isAuthenticated={isAuthenticated} />;
}
