/**
 * /api/engagement/reply
 *
 * POST { inbox_item_id, reply_content, is_ai_generated }
 *   → Sends a reply to the platform, inserts a record in engagement_replies,
 *     and marks the inbox item as is_replied = true.
 *
 * POST { inbox_item_id, generate_only: true }
 *   → Uses Anthropic to generate a suggested reply without sending it.
 *     Returns { suggestion: string }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

// ── Send reply to platform ────────────────────────────────────────────────────

async function sendReplyToPlatform(
  platform: string,
  platformItemId: string,
  replyContent: string
): Promise<{ success: boolean; platformReplyId: string | null; error: string | null }> {
  switch (platform) {
    case 'instagram': {
      const token = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (!token) return { success: false, platformReplyId: null, error: 'No Instagram token' };
      const res = await fetch(
        `https://graph.instagram.com/v18.0/${platformItemId}/replies` +
          `?message=${encodeURIComponent(replyContent)}&access_token=${token}`,
        { method: 'POST' }
      );
      const data = await res.json();
      return {
        success: res.ok,
        platformReplyId: data.id ?? null,
        error: res.ok ? null : (data.error?.message ?? 'Failed to reply'),
      };
    }
    case 'facebook': {
      const token = process.env.FACEBOOK_ACCESS_TOKEN;
      if (!token) return { success: false, platformReplyId: null, error: 'No Facebook token' };
      const body = new URLSearchParams({ message: replyContent, access_token: token });
      const res = await fetch(`https://graph.facebook.com/v18.0/${platformItemId}/comments`, {
        method: 'POST',
        body,
      });
      const data = await res.json();
      return {
        success: res.ok,
        platformReplyId: data.id ?? null,
        error: res.ok ? null : (data.error?.message ?? 'Failed to reply'),
      };
    }
    case 'google_business': {
      const token = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
      const locationName = process.env.GOOGLE_BUSINESS_LOCATION_NAME;
      if (!token || !locationName) return { success: false, platformReplyId: null, error: 'No Google token' };
      const res = await fetch(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews/${platformItemId}/reply`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ comment: replyContent }),
        }
      );
      return {
        success: res.ok,
        platformReplyId: res.ok ? platformItemId : null,
        error: res.ok ? null : 'Failed to reply to review',
      };
    }
    // LinkedIn comment replies not yet supported via API
    default:
      return { success: false, platformReplyId: null, error: `Reply not supported for ${platform}` };
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const body = await request.json();
  const { inbox_item_id, reply_content, is_ai_generated, generate_only } = body as {
    inbox_item_id: string;
    reply_content?: string;
    is_ai_generated?: boolean;
    generate_only?: boolean;
  };

  if (!inbox_item_id) {
    return NextResponse.json({ error: 'inbox_item_id is required' }, { status: 400 });
  }

  // Fetch the inbox item + platform info
  const { data: item, error: itemError } = await supabase
    .from('engagement_inbox')
    .select('*, social_platforms ( platform_name )')
    .eq('id', inbox_item_id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
  }

  const platform =
    (item.social_platforms as unknown as { platform_name: string } | null)?.platform_name ?? '';

  // ── Generate AI suggestion only ─────────────────────────────────────────
  if (generate_only) {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No AI API key configured' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content:
            `You are a professional social media manager for a real estate team. ` +
            `Write a short, friendly, professional reply to this ${item.type} on ${platform}:\n\n` +
            `"${item.content}"\n\n` +
            `Reply in 1-3 sentences. Do not include hashtags or emojis. ` +
            `Be warm and helpful.`,
        },
      ],
    });

    const suggestion =
      message.content[0]?.type === 'text' ? message.content[0].text : 'Unable to generate reply.';
    return NextResponse.json({ suggestion });
  }

  // ── Send real reply ─────────────────────────────────────────────────────
  if (!reply_content) {
    return NextResponse.json({ error: 'reply_content is required' }, { status: 400 });
  }

  // Get current user for tracking who sent the reply
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: teamMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', user?.id ?? '')
    .maybeSingle();

  // Send to platform
  const { success, platformReplyId, error: sendError } = await sendReplyToPlatform(
    platform,
    item.platform_item_id,
    reply_content
  );

  if (!success) {
    return NextResponse.json({ error: sendError ?? 'Failed to send reply' }, { status: 502 });
  }

  // Insert into engagement_replies
  const { data: reply, error: replyError } = await supabase
    .from('engagement_replies')
    .insert({
      inbox_item_id,
      reply_content,
      is_ai_generated: is_ai_generated ?? false,
      sent_by: teamMember?.id ?? null,
      sent_at: new Date().toISOString(),
      platform_reply_id: platformReplyId,
    })
    .select()
    .single();

  if (replyError) {
    return NextResponse.json({ error: replyError.message }, { status: 500 });
  }

  // Mark inbox item as replied + read
  await supabase
    .from('engagement_inbox')
    .update({ is_replied: true, is_read: true })
    .eq('id', inbox_item_id);

  return NextResponse.json(reply);
}
