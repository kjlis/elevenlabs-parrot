/**
 * ElevenLabs Conversational AI
 *
 * Handles WebSocket connection to ElevenLabs and microphone capture.
 */

import { MicrophoneCapture, arrayBufferToBase64 } from "chatdio";

const SAMPLE_RATE = 16000;

let websocket: WebSocket | null = null;
let micCapture: MicrophoneCapture | null = null;
let isInitialized = false;

interface ElevenLabsMessage {
  type: string;
  conversation_initiation_metadata_event?: {
    conversation_id: string;
    agent_output_audio_format: string;
  };
  audio_event?: { audio_base_64: string };
  user_transcription_event?: { user_transcript: string };
  agent_response_event?: { agent_response: string };
  ping_event?: { event_id: number };
}

let audioChunkCount = 0;

export interface ElevenLabsCallbacks {
  onReady?: () => void;
  onAudio?: (base64Audio: string) => void;
  onUserTranscript?: (text: string) => void;
  onAgentResponse?: (text: string) => void;
  onInterrupt?: () => void;
  onDisconnect?: () => void;
  onError?: () => void;
}

/**
 * Set up microphone capture and send audio to ElevenLabs
 */
async function setupMicrophone() {
  micCapture = new MicrophoneCapture({
    sampleRate: SAMPLE_RATE,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });

  micCapture.on("data", (data: ArrayBuffer) => {
    if (websocket?.readyState === WebSocket.OPEN && isInitialized) {
      websocket.send(
        JSON.stringify({ user_audio_chunk: arrayBufferToBase64(data) })
      );
    }
  });

  await micCapture.start();
  console.log("[Mic] Capturing at 16kHz");
}

/**
 * Connect to ElevenLabs Conversational AI WebSocket
 */
export async function connectElevenLabs(
  agentId: string,
  callbacks: ElevenLabsCallbacks
) {
  websocket = new WebSocket(
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`
  );

  websocket.onopen = async () => {
    console.log("[11Labs] WebSocket connected");
    audioChunkCount = 0;
    await setupMicrophone();
    callbacks.onReady?.();
  };

  websocket.onmessage = (event) => {
    const msg: ElevenLabsMessage = JSON.parse(event.data);

    switch (msg.type) {
      case "conversation_initiation_metadata": {
        isInitialized = true;
        const meta = msg.conversation_initiation_metadata_event;
        console.log("[11Labs] Session started:", {
          conversationId: meta?.conversation_id,
          audioFormat: meta?.agent_output_audio_format,
        });
        break;
      }

      case "audio":
        if (msg.audio_event?.audio_base_64) {
          audioChunkCount++;
          const bytes = atob(msg.audio_event.audio_base_64).length;
          console.log(
            `[11Labs] Audio chunk #${audioChunkCount}: ${bytes} bytes`
          );
          callbacks.onAudio?.(msg.audio_event.audio_base_64);
        }
        break;

      case "agent_response":
        if (msg.agent_response_event?.agent_response) {
          console.log(
            "[11Labs] Agent:",
            msg.agent_response_event.agent_response
          );
          callbacks.onAgentResponse?.(msg.agent_response_event.agent_response);
        }
        break;

      case "user_transcript":
        if (msg.user_transcription_event?.user_transcript) {
          console.log(
            "[11Labs] User:",
            msg.user_transcription_event.user_transcript
          );
          callbacks.onUserTranscript?.(
            msg.user_transcription_event.user_transcript
          );
        }
        break;

      case "interruption":
        console.log("[11Labs] Interruption detected");
        callbacks.onInterrupt?.();
        break;

      case "ping":
        websocket?.send(
          JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id })
        );
        break;

      default:
        console.log("[11Labs] Unknown message:", msg.type, msg);
    }
  };

  websocket.onclose = (event) => {
    console.log("[11Labs] WebSocket closed:", event.code, event.reason);
    console.log(`[11Labs] Total audio chunks received: ${audioChunkCount}`);
    isInitialized = false;
    callbacks.onDisconnect?.();
  };

  websocket.onerror = (error) => {
    console.error("[11Labs] WebSocket error:", error);
    callbacks.onError?.();
  };
}

/**
 * Disconnect from ElevenLabs and stop microphone
 */
export function stopElevenLabs() {
  isInitialized = false;
  websocket?.close();
  websocket = null;
  micCapture?.stop();
  micCapture = null;
}
