import { Context } from "hono";

type Profile = {
  id: string;
  label: string;
  elevenLabsAgentId: string;
  anamAvatarId: string;
};

export const Config = async (c: Context) => {
  const anamApiKey = c.env.ANAM_API_KEY;
  const avatarId = c.env.ANAM_AVATAR_ID;
  const elevenLabsAgentId = c.env.ELEVENLABS_AGENT_ID;
  const elevenLabsApiKey = c.env.ELEVENLABS_API_KEY;
  const profilesJson = c.env.PROFILES_JSON;

  const hasProfiles = profilesJson && profilesJson.trim().length > 0;
  const hasDefaultEnv = anamApiKey && avatarId && elevenLabsAgentId;

  if (!hasProfiles && !hasDefaultEnv) {
    return c.json(
      {
        error:
          "Missing environment variables. Provide PROFILES_JSON or set ANAM_API_KEY, ANAM_AVATAR_ID, ELEVENLABS_AGENT_ID",
      },
      500
    );
  }

  const profileId = c.req.query("profileId") || "default";
  let profiles: Profile[] = [];

  if (profilesJson) {
    try {
      const parsed = JSON.parse(profilesJson);
      if (Array.isArray(parsed)) {
        profiles = parsed.filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.elevenLabsAgentId === "string" &&
            typeof p.anamAvatarId === "string"
        );
      }
    } catch (err) {
      console.error("Failed to parse PROFILES_JSON", err);
    }
  }

  if (!profiles.length) {
    profiles.push({
      id: "default",
      label: "Default",
      elevenLabsAgentId,
      anamAvatarId: avatarId,
    });
  }

  const selected = profiles.find((p) => p.id === profileId) || profiles[0];

  try {
    const response = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anamApiKey}`,
      },
      body: JSON.stringify({
        personaConfig: {
          avatarId: selected.anamAvatarId,
          avatarOnly: true,
          enableAudioPassthrough: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Anam API error:", error);
      return c.json({ error: "Failed to get Anam session token" }, 500);
    }

    const data = await response.json();
    return c.json({
      anamSessionToken: data.sessionToken,
      elevenLabsAgentId: selected.elevenLabsAgentId,
      elevenLabsApiKey,
      profiles,
      activeProfileId: selected.id,
    });
  } catch (error) {
    console.error("Config error:", error);
    return c.json({ error: "Failed to get config" }, 500);
  }
};
