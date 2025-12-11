/**
 * ElevenLabs + Anam Integration Demo
 *
 * Main client - orchestrates the UI and connects the modules together.
 */

import { createClient } from "@anam-ai/js-sdk";
import type AnamClient from "@anam-ai/js-sdk/dist/module/AnamClient";
import { connectElevenLabs, stopElevenLabs } from "./elevenlabs";

// ============================================================================
// STATE
// ============================================================================

let isConnected = false;
let anamClient: AnamClient | null = null;
let cachedReport: Report | null = null;
let conversationId: string | null = null;
let currentProjectId = "parrot/demo";
let isRefreshing = false;
let currentProfileId = "default";
let profiles: Profile[] = [];

interface Config {
  anamSessionToken: string;
  elevenLabsAgentId: string;
  elevenLabsApiKey?: string;
  profiles?: Profile[];
  activeProfileId?: string;
}

interface Report {
  projectId: string;
  projectName: string;
  from: string;
  to: string;
  summary: string;
  generatedAt?: number;
  source?: string;
}

interface Profile {
  id: string;
  label: string;
  elevenLabsAgentId: string;
  anamAvatarId: string;
}

// ============================================================================
// DOM
// ============================================================================

const $ = (id: string) => document.getElementById(id);
const connectBtn = $("connect-btn") as HTMLButtonElement;
const btnText = $("btn-text") as HTMLSpanElement;
const transcript = $("transcript") as HTMLDivElement;
const statusText = $("status-text") as HTMLParagraphElement;
const anamVideo = $("anam-video") as HTMLVideoElement;
const avatarPlaceholder = $("avatar-placeholder") as HTMLDivElement;
const errorContainer = $("error-container") as HTMLDivElement;
const errorText = $("error-text") as HTMLParagraphElement;
const liveRegion = $("live-region") as HTMLDivElement | null;
const reportCard = $("report-card") as HTMLDivElement | null;
const reportBody = $("report-body") as HTMLDivElement | null;
const reportMeta = $("report-meta") as HTMLDivElement | null;
const projectSelect = $("project-select") as HTMLSelectElement | null;
const refreshReportBtn = $("refresh-report") as HTMLButtonElement | null;
const loadTranscriptBtn = $("load-transcript") as HTMLButtonElement | null;
const conversationIdLabel = $("conversation-id") as HTMLSpanElement | null;
const transcriptList = $("transcript-list") as HTMLSelectElement | null;
const refreshSpinner = $("refresh-spinner") as HTMLSpanElement | null;
const profileSelect = document.getElementById("profile-select") as HTMLSelectElement | null;
const speakingAs = document.getElementById("speaking-as") as HTMLDivElement | null;

// initialize project from URL, localStorage, or default
const urlProject = new URLSearchParams(window.location.search).get("projectId");
const storedProject = localStorage.getItem("parrot:projectId");
if (urlProject) {
  currentProjectId = urlProject;
} else if (storedProject) {
  currentProjectId = storedProject;
}
if (projectSelect) {
  projectSelect.value = currentProjectId;
}

// profile init
const urlProfile = new URLSearchParams(window.location.search).get("profileId");
const storedProfile = localStorage.getItem("parrot:profileId");
if (urlProfile) currentProfileId = urlProfile;
else if (storedProfile) currentProfileId = storedProfile;
if (profileSelect) {
  profileSelect.value = currentProfileId;
}

function currentProfile(): Profile | undefined {
  return (
    profiles.find((p) => p.id === currentProfileId) ||
    profiles.find((p) => p.id === "default")
  );
}

function currentAgentId(): string {
  return currentProfile()?.elevenLabsAgentId || "";
}

function updateSpeakingAs() {
  if (!speakingAs) return;
  const profile = currentProfile();
  speakingAs.textContent = profile
    ? `Speaking as: ${profile.label || profile.id}`
    : "";
}

// ============================================================================
// UI HELPERS
// ============================================================================

function setConnected(connected: boolean) {
  isConnected = connected;
  btnText.textContent = connected ? "End Conversation" : "Start Conversation";
  connectBtn.classList.toggle("bg-red-600", connected);
  connectBtn.classList.toggle("hover:bg-red-500", connected);
  connectBtn.classList.toggle("bg-labs-600", !connected);
  connectBtn.classList.toggle("hover:bg-labs-500", !connected);
  statusText.textContent = connected ? "Listening" : "Disconnected";
}

function showVideo(show: boolean) {
  anamVideo.classList.toggle("hidden", !show);
  avatarPlaceholder.classList.toggle("hidden", show);
}

function addMessage(role: "user" | "agent" | "system", text: string) {
  if (transcript.querySelector(".text-center")) {
    transcript.innerHTML = "";
  }

  const color =
    role === "user"
      ? "text-blue-400"
      : role === "agent"
      ? "text-labs-400"
      : "text-zinc-500";
  const label = role === "user" ? "You" : role === "agent" ? "Agent" : "•";

  transcript.insertAdjacentHTML(
    "beforeend",
    `<div class="fade-in">
      <span class="${color} font-medium">${label}:</span>
      <span class="text-zinc-200">${text}</span>
    </div>`
  );
  transcript.scrollTop = transcript.scrollHeight;

  void persistTranscript(role, text);
}

function showError(message: string) {
  errorText.textContent = message;
  errorContainer.classList.remove("hidden");
  setTimeout(() => errorContainer.classList.add("hidden"), 5000);
  if (liveRegion) {
    liveRegion.textContent = message;
  }
}

function renderReport(report?: Report) {
  if (!reportCard || !reportBody) return;
  if (!report) {
    reportBody.innerHTML =
      '<p class="text-zinc-500">No report available. Provide public/report.json or set REPORT_SOURCE_URL.</p>';
    if (reportMeta) reportMeta.textContent = "";
    return;
  }

  reportBody.innerHTML = "";

  const header = document.createElement("div");
  header.className =
    "flex items-center justify-between text-xs text-zinc-500 mb-2";

  const nameSpan = document.createElement("span");
  nameSpan.textContent = report.projectName;

  const windowSpan = document.createElement("span");
  windowSpan.textContent = `${report.from} → ${report.to}`;

  header.appendChild(nameSpan);
  header.appendChild(windowSpan);

  const pre = document.createElement("pre");
  pre.className = "whitespace-pre-wrap text-sm text-zinc-100";
  pre.textContent = report.summary;

  reportBody.appendChild(header);
  reportBody.appendChild(pre);

  if (reportMeta) {
    const date =
      report.generatedAt && !Number.isNaN(report.generatedAt)
        ? new Date(report.generatedAt).toLocaleString()
        : "unknown";
    const source = report.source || "unknown";
    reportMeta.textContent = `Updated: ${date} • Source: ${source}`;
  }
  updateSpeakingAs();
}

function buildContextText(report?: Report) {
  if (!report) return "";

  return [
    "CodeRabbit project report:",
    `Project: ${report.projectName}`,
    `Window: ${report.from} → ${report.to}`,
    report.summary,
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchConfig(): Promise<Config> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load config");
  const cfg: Config = await res.json();

  if (cfg.profiles && profileSelect) {
    profiles = cfg.profiles;
    profileSelect.innerHTML = "";
    cfg.profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label || p.id;
      profileSelect.appendChild(opt);
    });
    const exists = cfg.profiles.some((p) => p.id === currentProfileId);
    if (!exists && cfg.activeProfileId) {
      currentProfileId = cfg.activeProfileId;
    }
    profileSelect.value = currentProfileId;
    updateSpeakingAs();
  }

  return cfg;
}

async function fetchReport(): Promise<Report | null> {
  const res = await fetch(
    `/api/report?projectId=${encodeURIComponent(
      currentProjectId
    )}&profileId=${encodeURIComponent(currentProfileId)}`
  );
  if (!res.ok) return null;
  return res.json();
}

async function persistTranscript(
  role: "user" | "agent" | "system",
  text: string
) {
  if (!conversationId) return;
  const projectId = currentProjectId || cachedReport?.projectId || "default-project";
  const agentId = currentAgentId();
  try {
    await fetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        conversationId,
        role,
        text,
        agentId,
      }),
    });
  } catch (error) {
    console.warn("Transcript persist failed:", error);
  }
}

async function loadReport(triggeredByRefresh = false) {
  if (isRefreshing) return;
  isRefreshing = true;
  if (refreshReportBtn) refreshReportBtn.disabled = true;
  if (refreshSpinner) refreshSpinner.classList.remove("hidden");
  try {
    cachedReport = await fetchReport();
    renderReport(cachedReport || undefined);
    if (triggeredByRefresh) {
      addMessage(
        "system",
        cachedReport ? "Report refreshed." : "No report found."
      );
    }
  } catch (error) {
    console.error("Report load error:", error);
    renderReport(undefined);
  } finally {
    isRefreshing = false;
    if (refreshReportBtn) refreshReportBtn.disabled = false;
    if (refreshSpinner) refreshSpinner.classList.add("hidden");
  }
}

async function fetchTranscriptHistory() {
  if (!conversationId) {
    showError("No conversation yet");
    return;
  }
  try {
    const res = await fetch(
      `/api/transcript?conversationId=${encodeURIComponent(
        conversationId
      )}&projectId=${encodeURIComponent(currentProjectId)}`
    );
    if (!res.ok) {
      showError("Failed to load transcript");
      return;
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      showError("Transcript response invalid");
      return;
    }
    transcript.innerHTML = "";
    data.forEach((entry: any) => {
      const role = entry.role as "user" | "agent" | "system";
      const text = entry.text as string;
      addMessage(role, text);
    });
  } catch (error) {
    console.error("Transcript history error:", error);
    showError("Failed to load transcript");
  }
}

async function fetchTranscriptList() {
  if (!transcriptList) return;
  try {
    const res = await fetch(
      `/api/transcript?projectId=${encodeURIComponent(
        currentProjectId
      )}&limit=10&agentId=${encodeURIComponent(currentAgentId())}`
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    transcriptList.innerHTML = `<option value="">Last transcripts…</option>`;
    data.forEach((item: any) => {
      const label = `${item.conversationId} • ${new Date(
        item.lastTs
      ).toLocaleString()}`;
      const option = document.createElement("option");
      option.value = item.conversationId;
      option.textContent = label;
      transcriptList.appendChild(option);
    });
  } catch (error) {
    console.warn("Transcript list error:", error);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function start() {
  connectBtn.disabled = true;
  btnText.textContent = "Connecting...";

  try {
    conversationId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    if (conversationIdLabel) {
      conversationIdLabel.textContent = conversationId;
    }

    // Fetch config + report in parallel
    const [config, report] = await Promise.all([
      fetchConfig(),
      cachedReport ? Promise.resolve(cachedReport) : fetchReport(),
    ]);
    cachedReport = report;
    renderReport(report || undefined);

    // Initialize Anam avatar with the audio stream
    console.log("[Anam] Creating client...");
    anamClient = createClient(config.anamSessionToken, {
      disableInputAudio: true,
    });
    await anamClient.streamToVideoElement("anam-video");
    console.log(
      "[Anam] Streaming to video element, session:",
      anamClient.getActiveSessionId()
    );
    showVideo(true);

    const agentAudioInputStream = anamClient.createAgentAudioInputStream({
      encoding: "pcm_s16le",
      sampleRate: 16000,
      channels: 1,
    });

    // Connect to ElevenLabs
    await connectElevenLabs(
      currentAgentId(),
      {
        onReady: () => {
          setConnected(true);
          addMessage("system", "Connected. Start speaking...");
        },
        onAudio: (audio) => {
          agentAudioInputStream.sendAudioChunk(audio);
        },
        onUserTranscript: (text) => addMessage("user", text),
        onAgentResponse: (text) => {
          agentAudioInputStream.endSequence();
          addMessage("agent", text);
        },
        onInterrupt: () => {
          addMessage("agent", "Interrupted");
          anamClient?.interruptPersona();
          agentAudioInputStream.endSequence();
        },
        onDisconnect: () => setConnected(false),
        onError: () => showError("Connection error"),
        onContextTruncated: (original, sent) => {
          addMessage(
            "system",
            `Context truncated (${sent}/${original} chars).`
          );
        },
      },
      buildContextText(report || undefined),
      config.elevenLabsApiKey
    );
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to start");
    btnText.textContent = "Start Conversation";
    showVideo(false);
  } finally {
    connectBtn.disabled = false;
  }
}

async function stop() {
  stopElevenLabs();
  await anamClient?.stopStreaming();
  anamClient = null;
  showVideo(false);
  setConnected(false);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Load report summary on page load
void loadReport();

connectBtn.addEventListener("click", () => {
  isConnected ? stop() : start();
});

window.addEventListener("beforeunload", stop);

projectSelect?.addEventListener("change", () => {
  currentProjectId = projectSelect.value;
  const url = new URL(window.location.href);
  url.searchParams.set("projectId", currentProjectId);
  window.history.replaceState({}, "", url.toString());
  localStorage.setItem("parrot:projectId", currentProjectId);
  void loadReport(true);
  void fetchTranscriptList();
});

refreshReportBtn?.addEventListener("click", () => void loadReport(true));
loadTranscriptBtn?.addEventListener("click", () => void fetchTranscriptHistory());
transcriptList?.addEventListener("change", () => {
  const selected = transcriptList.value;
  if (!selected) return;
  conversationId = selected;
  if (conversationIdLabel) conversationIdLabel.textContent = conversationId;
  void fetchTranscriptHistory();
});

profileSelect?.addEventListener("change", () => {
  currentProfileId = profileSelect.value;
  localStorage.setItem("parrot:profileId", currentProfileId);
  const url = new URL(window.location.href);
  url.searchParams.set("profileId", currentProfileId);
  window.history.replaceState({}, "", url.toString());
  void fetchTranscriptList();
});

console.log("ElevenLabs + Anam Demo ready");
