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

async function generateFromCodeRabbit(
  c: Context
): Promise<{ raw: any[]; from: string; to: string } | null> {
  const apiKey = c.env.CODERABBIT_API_KEY;
  if (!apiKey) return null;

  // Last 24 hours
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  try {
    const res = await fetch("https://api.coderabbit.ai/api/v1/report.generate", {
      method: "POST",
      headers: {
        "x-coderabbitai-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to }),
    });

    if (!res.ok) {
      console.error("CodeRabbit API failed:", res.status, res.statusText);
      return null;
    }

    const raw = await res.json();
    return { raw, from, to };
  } catch (error) {
    console.error("CodeRabbit API error:", error);
    return null;
  }
}

async function storeToConvex(
  c: Context,
  projectId: string,
  from: string,
  to: string,
  raw: any[]
): Promise<void> {
  const convexUrl = c.env.CONVEX_URL || c.env.VITE_CONVEX_URL;
  if (!convexUrl) return;

  try {
    await fetch(`${convexUrl}/api/mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.env.CONVEX_ADMIN_KEY
          ? { Authorization: `Bearer ${c.env.CONVEX_ADMIN_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        path: "parrot:storeReport",
        args: {
          projectId,
          projectName: projectId,
          from,
          to,
          raw,
        },
        format: "json",
      }),
    });
  } catch (error) {
    console.error("Convex store error:", error);
  }
}

/**
 * Returns the latest CodeRabbit report.
 *
 * If generate=true is passed, fetches fresh report from CodeRabbit API
 * and stores it in Convex before returning.
 *
 * Source priority:
 * 1) generate=true: CodeRabbit API → store in Convex → return
 * 2) Convex query (if CONVEX_URL is configured)
 * 3) REPORT_SOURCE_URL env (any reachable JSON endpoint)
 * 4) Static asset at /report.json (served from public/)
 * 5) Inline fallback sample
 */
export const Report = async (c: Context) => {
  const projectId =
    c.req.query("projectId") || c.env.REPORT_PROJECT_ID || "default-project";
  const profileId = c.req.query("profileId");
  const shouldGenerate = c.req.query("generate") === "true";

  // Generate fresh report from CodeRabbit API if requested
  if (shouldGenerate) {
    const generated = await generateFromCodeRabbit(c);
    if (generated) {
      const { raw, from, to } = generated;

      // Store in Convex
      await storeToConvex(c, projectId, from, to, raw);

      // Build summary from raw response
      const summary = (raw ?? [])
        .map(
          (g: any) =>
            "### " +
            (g?.group ?? "Update") +
            "\n" +
            (g?.report ?? JSON.stringify(g ?? {}, null, 2))
        )
        .join("\n\n")
        .slice(0, 8000);

      return c.json({
        projectId,
        projectName: projectId,
        from,
        to,
        summary,
        generatedAt: Date.now(),
        source: "coderabbit",
      });
    }
    // If generation failed, fall through to other sources
    console.warn("CodeRabbit generation failed, falling back to cached data");
  }

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
