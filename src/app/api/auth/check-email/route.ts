import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPA_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "missing or invalid email" }, { status: 400 });
    }

    if (!SUPA_URL || !SUPA_SERVICE_ROLE) {
      return NextResponse.json({ error: "server not configured" }, { status: 500 });
    }

    const supabaseAdmin = createClient(SUPA_URL, SUPA_SERVICE_ROLE);
    const target = email.trim().toLowerCase();

    // Paginate through users to find a matching email.
    // Note: For large userbases, consider moving to a DB mirror or server-side cache.
    const perPage = 200;
    const maxPages = 10; 
    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const found = data.users?.some(u => (u.email || "").toLowerCase() === target);
      if (found) {
        return NextResponse.json({ exists: true });
      }
      if (!data.users || data.users.length < perPage) {
        // no more pages
        break;
      }
    }

    return NextResponse.json({ exists: false });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
