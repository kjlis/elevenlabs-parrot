import { Context } from "hono";

type Profile = {
  id: string;
  label: string;
  elevenLabsAgentId: string;
  anamAvatarId: string;
  displayName?: string;
  githubUser?: string;
};

export const Config = async (c: Context) => {
  const anamApiKey = c.env.ANAM_API_KEY;
  const avatarId = c.env.ANAM_AVATAR_ID;
  const elevenLabsAgentId = c.env.ELEVENLABS_AGENT_ID;
  const elevenLabsApiKey = c.env.ELEVENLABS_API_KEY;

  if (!anamApiKey || !avatarId || !elevenLabsAgentId) {
    return c.json(
      {
        error:
          "Missing environment variables. Check ANAM_API_KEY, ANAM_AVATAR_ID, and ELEVENLABS_AGENT_ID",
      },
      500
    );
  }

  const profileId = c.req.query("profileId") || "default";
  const profiles: Profile[] = [
    {
      id: "default",
      label: "Default",
      elevenLabsAgentId,
      anamAvatarId: avatarId,
      displayName: "Default",
    },
  ];

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
