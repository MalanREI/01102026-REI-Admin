import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

// GET /api/approval?post_id=<id>   → approvals for a post
// GET /api/approval?pending=true   → all pending approvals
export async function GET(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const p = req.nextUrl.searchParams;

    const postId = p.get("post_id");
    const pending = p.get("pending");

    let query = db
      .from("content_approvals")
      .select(
        "*, post:content_posts(*), submitted_by_member:team_members!submitted_by(id,display_name,email,avatar_url), reviewed_by_member:team_members!reviewed_by(id,display_name,email,avatar_url)"
      )
      .order("submitted_at", { ascending: false });

    if (postId) query = query.eq("post_id", postId);
    if (pending === "true") query = query.eq("status", "pending");

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/approval  { post_id, submitted_by }
// Submits a post for approval: inserts a content_approval row and sets post status to pending_approval
export async function POST(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const body = await req.json();
    const { post_id, submitted_by, review_notes } = body;

    if (!post_id || !submitted_by) {
      return NextResponse.json({ error: "post_id and submitted_by are required" }, { status: 400 });
    }

    // Insert approval record
    const { data: approval, error: approvalError } = await db
      .from("content_approvals")
      .insert({
        post_id,
        submitted_by,
        status: "pending",
        review_notes: review_notes ?? null,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 500 });

    // Update post status to pending_approval
    const { error: postError } = await db
      .from("content_posts")
      .update({ status: "pending_approval", updated_at: new Date().toISOString() })
      .eq("id", post_id);

    if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });

    // Create notification for managers/admins
    const { data: managers } = await db
      .from("team_members")
      .select("id")
      .in("role", ["manager", "admin"])
      .eq("is_active", true);

    if (managers && managers.length > 0) {
      const notifications = managers.map((m) => ({
        recipient_id: m.id,
        type: "approval_requested",
        post_id,
        actor_id: submitted_by,
        is_read: false,
        created_at: new Date().toISOString(),
      }));
      await db.from("notifications").insert(notifications);
    }

    return NextResponse.json(approval, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/approval  { id, status, reviewed_by, review_notes }
// Approve or reject an approval record, and update post status accordingly
export async function PATCH(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const body = await req.json();
    const { id, status, reviewed_by, review_notes } = body;

    if (!id || !status || !reviewed_by) {
      return NextResponse.json({ error: "id, status, and reviewed_by are required" }, { status: 400 });
    }

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
    }

    // Get the approval to find post_id and submitter
    const { data: existing, error: fetchError } = await db
      .from("content_approvals")
      .select("post_id, submitted_by")
      .eq("id", id)
      .single();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 });

    // Update the approval record
    const { data: approval, error: approvalError } = await db
      .from("content_approvals")
      .update({
        status,
        reviewed_by,
        review_notes: review_notes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 500 });

    // Update post status to match approval decision
    const postStatus = status === "approved" ? "approved" : "rejected";
    const { error: postError } = await db
      .from("content_posts")
      .update({ status: postStatus, updated_at: new Date().toISOString() })
      .eq("id", existing.post_id);

    if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });

    // Notify the original submitter
    await db.from("notifications").insert({
      recipient_id: existing.submitted_by,
      type: status === "approved" ? "approval_approved" : "approval_rejected",
      post_id: existing.post_id,
      actor_id: reviewed_by,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(approval);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
