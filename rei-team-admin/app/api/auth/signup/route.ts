import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { email, password, full_name } = (await req.json()) as {
      email?: string;
      password?: string;
      full_name?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.user?.id });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Signup failed" }, { status: 500 });
  }
}
