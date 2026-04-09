import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getSession() {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch {
    return null;
  }
}

export async function requireUserId(): Promise<
  { userId: string } | { error: Response }
> {
  const session = await getSession();
  if (!session?.user?.id) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { userId: session.user.id };
}
