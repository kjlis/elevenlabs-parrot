import { Hono } from "hono";
import { renderer } from "./renderer";
import { Index } from "./routes/index";
import { Config } from "./routes/api/config";
import { Report } from "./routes/api/report";
import { Transcript } from "./routes/api/transcript";

type Bindings = {
  ANAM_API_KEY: string;
  ANAM_AVATAR_ID: string;
  ELEVENLABS_AGENT_ID: string;
  CONVEX_URL?: string;
  CONVEX_ADMIN_KEY?: string;
  REPORT_PROJECT_ID?: string;
  REPORT_SOURCE_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(renderer);

// API route to get config (Anam session token + ElevenLabs agent ID)
app.get("/api/config", Config);
// API route to fetch latest project report
app.get("/api/report", Report);
// API route to persist transcript turns
app.post("/api/transcript", Transcript);
// Main page
app.get("/", Index);

export default app;
