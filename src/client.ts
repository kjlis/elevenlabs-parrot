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

interface Config {
  anamSessionToken: string;
  elevenLabsAgentId: string;
}

interface Report {
  projectId: string;
  projectName: string;
  from: string;
  to: string;
  summary: string;
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
const reportCard = $("report-card") as HTMLDivElement | null;
const reportBody = $("report-body") as HTMLDivElement | null;

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
}

function showError(message: string) {
  errorText.textContent = message;
  errorContainer.classList.remove("hidden");
  setTimeout(() => errorContainer.classList.add("hidden"), 5000);
}

function renderReport(report?: Report) {
  if (!reportCard || !reportBody) return;
  if (!report) {
    reportBody.innerHTML =
      '<p class="text-zinc-500">No report available. Provide public/report.json or set REPORT_SOURCE_URL.</p>';
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
}

function buildContextText(report?: Report) {
  if (!report) return "";
  return [
    "CodeRabbit project report:",
    `Project: ${report.projectName}`,
    `Window: ${report.from} → ${report.to}`,
    "",
    report.summary,
  ].join("\n");
}

async function fetchConfig(): Promise<Config> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load config");
  return res.json();
}

async function fetchReport(): Promise<Report | null> {
  const res = await fetch("/api/report");
  if (!res.ok) return null;
  return res.json();
}

async function loadReport() {
  try {
    cachedReport = await fetchReport();
    renderReport(cachedReport || undefined);
  } catch (error) {
    console.error("Report load error:", error);
    renderReport(undefined);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function start() {
  connectBtn.disabled = true;
  btnText.textContent = "Connecting...";

  try {
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
    await connectElevenLabs(config.elevenLabsAgentId, {
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
    },
    buildContextText(report || undefined));
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

console.log("ElevenLabs + Anam Demo ready");
