import { Hono } from "hono";
import { renderer } from "./renderer";
import { Index } from "./routes/index";
import { Config } from "./routes/api/config";
import { Report } from "./routes/api/report";

type Bindings = {
  ANAM_API_KEY: string;
  ANAM_AVATAR_ID: string;
  ELEVENLABS_AGENT_ID: string;
  REPORT_SOURCE_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(renderer);

// API route to get config (Anam session token + ElevenLabs agent ID)
app.get("/api/config", Config);
// API route to fetch latest project report
app.get("/api/report", Report);
// Main page
app.get("/", Index);

export default app;
