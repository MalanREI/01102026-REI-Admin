/**
 * /api/engagement
 *
 * GET  ?platform=instagram&type=comment&is_read=false&page=0&limit=50
 *   → Returns a paginated list of engagement_inbox items.
 *
 * PATCH { id, is_read?, is_replied?, sentiment? }
 *   → Updates a single inbox item's read/replied/sentiment state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const platform = searchParams.get('platform');
  const type = searchParams.get('type');
  const isRead = searchParams.get('is_read');
  const page = parseInt(searchParams.get('page') ?? '0', 10);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);

  let query = supabase
    .from('engagement_inbox')
    .select(
      `
      *,
      social_platforms ( platform_name, account_name ),
      content_posts ( id, title, body )
    `,
      { count: 'exact' }
    )
    .order('received_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (platform) {
    query = query.eq('social_platforms.platform_name', platform);
  }
  if (type) {
    query = query.eq('type', type);
  }
  if (isRead !== null) {
    query = query.eq('is_read', isRead === 'true');
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data, total: count, page, limit });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const body = await request.json();
  const { id, is_read, is_replied, sentiment } = body as {
    id: string;
    is_read?: boolean;
    is_replied?: boolean;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (is_read !== undefined) updates.is_read = is_read;
  if (is_replied !== undefined) updates.is_replied = is_replied;
  if (sentiment !== undefined) updates.sentiment = sentiment;

  const { data, error } = await supabase
    .from('engagement_inbox')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
