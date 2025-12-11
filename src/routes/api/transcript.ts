import { Context } from "hono";

type TranscriptPayload = {
  projectId?: string;
  conversationId?: string;
  role?: "user" | "agent" | "system";
  text?: string;
};

export const Transcript = async (c: Context) => {
  const convexUrl = c.env.CONVEX_URL || c.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    return c.json(
      { error: "Convex not configured (set CONVEX_URL and CONVEX_ADMIN_KEY)" },
      501
    );
  }

  let body: TranscriptPayload;
  try {
    body = await c.req.json();
  } catch (_err) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const projectId =
    body.projectId || c.env.REPORT_PROJECT_ID || "default-project";
  const conversationId = body.conversationId;
  const role = body.role;
  const text = body.text;

  if (!conversationId || !role || !text) {
    return c.json({ error: "conversationId, role, and text are required" }, 400);
  }

  try {
    const res = await fetch(`${convexUrl}/api/mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.env.CONVEX_ADMIN_KEY
          ? { Authorization: `Bearer ${c.env.CONVEX_ADMIN_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        path: "parrot:appendTranscript",
        args: { projectId, conversationId, role, text },
        format: "json",
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error("Convex transcript error:", res.status, msg);
      return c.json({ error: "Failed to persist transcript" }, 502);
    }

    return c.json({ status: "ok" });
  } catch (error) {
    console.error("Transcript error:", error);
    return c.json({ error: "Failed to persist transcript" }, 500);
  }
};
