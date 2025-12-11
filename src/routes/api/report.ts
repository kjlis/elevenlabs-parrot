import { Context } from "hono";

const FALLBACK_REPORT = {
  projectId: "example/repo",
  projectName: "Parrot Demo",
  from: "2025-01-10",
  to: "2025-01-11",
  summary:
    "### Merged\n- Add Anam + ElevenLabs demo skeleton\n- Improve WebSocket logging\n\n### Open Risks\n- No persistence for transcripts\n- No multi-project switcher yet\n\n### Next Up\n- Inject CodeRabbit context into ElevenLabs using contextual_update\n- Add report source selector",
};

/**
 * Returns the latest CodeRabbit report.
 *
 * Source priority:
 * 1) REPORT_SOURCE_URL env (any reachable JSON endpoint)
 * 2) Static asset at /report.json (served from public/)
 */
export const Report = async (c: Context) => {
  const sourceUrl =
    c.env.REPORT_SOURCE_URL ||
    new URL("/report.json", c.req.url).toString();

  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.error("Report fetch failed:", res.status, res.statusText);
      return c.json(FALLBACK_REPORT);
    }

    const report = await res.json();
    return c.json(report);
  } catch (error) {
    console.error("Report error:", error);
    return c.json(FALLBACK_REPORT);
  }
};
