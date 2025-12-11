import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  reports: defineTable({
    projectId: v.string(),
    projectName: v.string(),
    from: v.string(),
    to: v.string(),
    generatedAt: v.number(),
    summary: v.string(),
    raw: v.any(),
    source: v.literal("coderabbit"),
    engineers: v.optional(
      v.array(
        v.object({
          displayName: v.string(),
          githubUser: v.optional(v.string()),
          avatarId: v.optional(v.string()),
          agentId: v.optional(v.string()),
        })
      )
    ),
  }).index("project", ["projectId", "generatedAt"]),

  transcripts: defineTable({
    projectId: v.string(),
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    text: v.string(),
    ts: v.number(),
  })
    .index("conversation", ["conversationId", "ts"])
    .index("project", ["projectId", "ts"]),
});
