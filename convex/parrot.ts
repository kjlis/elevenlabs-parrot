import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const storeReport = mutation({
  args: {
    projectId: v.string(),
    projectName: v.string(),
    from: v.string(),
    to: v.string(),
    raw: v.any(),
  },
  handler(ctx, args) {
    const summary = (args.raw ?? [])
      .map(
        (g: any) =>
          "### " +
          (g?.group ?? "Update") +
          "\n" +
          (g?.report ?? JSON.stringify(g ?? {}, null, 2))
      )
      .join("\n\n")
      .slice(0, 8000);

    return ctx.db.insert("reports", {
      ...args,
      summary,
      generatedAt: Date.now(),
      source: "coderabbit",
    });
  },
});

export const getLatestReport = query({
  args: { projectId: v.string() },
  handler(ctx, { projectId }) {
    return ctx.db
      .query("reports")
      .withIndex("project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .first();
  },
});

export const appendTranscript = mutation({
  args: {
    projectId: v.string(),
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    text: v.string(),
  },
  handler(ctx, args) {
    return ctx.db.insert("transcripts", {
      ...args,
      ts: Date.now(),
    });
  },
});

export const listTranscript = query({
  args: { conversationId: v.string() },
  handler(ctx, { conversationId }) {
    return ctx.db
      .query("transcripts")
      .withIndex("conversation", (q) => q.eq("conversationId", conversationId))
      .order("asc")
      .collect();
  },
});

export const listRecentConversations = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler(ctx, { projectId, limit }) {
    const byProject = ctx.db
      .query("transcripts")
      .withIndex("project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(limit ?? 10);

    const seen = new Set<string>();
    const conversations: { conversationId: string; lastTs: number }[] = [];

    for (const row of byProject) {
      if (!seen.has(row.conversationId)) {
        seen.add(row.conversationId);
        conversations.push({
          conversationId: row.conversationId,
          lastTs: row.ts,
        });
      }
      if (conversations.length >= (limit ?? 10)) break;
    }

    return conversations.sort((a, b) => b.lastTs - a.lastTs);
  },
});
