import { Context } from "hono";

const FALLBACK_REPORT = {
  projectId: "example/repo",
  projectName: "Parrot Demo",
  from: "2025-01-10",
  to: "2025-01-11",
  summary:
    "### Merged\n- Add Anam + ElevenLabs demo skeleton\n- Improve WebSocket logging\n\n### Open Risks\n- No persistence for transcripts\n- No multi-project switcher yet\n\n### Next Up\n- Inject CodeRabbit context into ElevenLabs using contextual_update\n- Add report source selector",
};

async function fetchFromConvex(
  c: Context,
  projectId: string,
  profileId?: string
): Promise<Response | null> {
  const convexUrl = c.env.CONVEX_URL || c.env.VITE_CONVEX_URL;
  if (!convexUrl) return null;

  try {
    const res = await fetch(`${convexUrl}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.env.CONVEX_ADMIN_KEY
          ? { Authorization: `Bearer ${c.env.CONVEX_ADMIN_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        path: "parrot:getLatestReport",
        args: { projectId, profileId },
        format: "json",
      }),
    });

    if (!res.ok) {
      console.error("Convex report fetch failed:", res.status, res.statusText);
      return null;
    }
    return res;
  } catch (error) {
    console.error("Convex report error:", error);
    return null;
  }
}

/**
 * Returns the latest CodeRabbit report.
 *
 * Source priority:
 * 1) Convex query (if CONVEX_URL is configured)
 * 2) REPORT_SOURCE_URL env (any reachable JSON endpoint)
 * 3) Static asset at /report.json (served from public/)
 * 4) Inline fallback sample
 */
export const Report = async (c: Context) => {
  const projectId =
    c.req.query("projectId") || c.env.REPORT_PROJECT_ID || "default-project";
  const profileId = c.req.query("profileId");

  // Try Convex first
  const convexRes = await fetchFromConvex(c, projectId);
  if (convexRes) {
    const data = await convexRes.json();
    if (data?.status === "success" && data.value) {
      return c.json(data.value);
    }
    if (data?.summary) {
      return c.json(data);
    }
  }

  // Then external source
  const sourceUrl =
    c.env.REPORT_SOURCE_URL ||
    new URL("/report.json", c.req.url).toString();

  try {
    const res = await fetch(sourceUrl);
    if (res.ok) {
      const report = await res.json();
      return c.json(report);
    }
    console.error("Report fetch failed:", res.status, res.statusText);
  } catch (error) {
    console.error("Report error:", error);
  }

  // Final fallback
  return c.json(FALLBACK_REPORT);
};
