import { headers } from "next/headers";
import { NewChatComposer } from "./new-chat-composer";

async function getIsAuthenticated() {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return !!session?.user;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const isAuthenticated = await getIsAuthenticated();
  return <NewChatComposer isAuthenticated={isAuthenticated} />;
}
