import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gijnybivawnsilzqegik.supabase.co";
const SUPA_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPA_SERVICE_ROLE) console.warn("Missing SUPABASE_SERVICE_ROLE_KEY in env");

const supabaseAdmin = createClient(SUPA_URL, SUPA_SERVICE_ROLE);

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const GMAIL_FROM = process.env.GMAIL_FROM || GMAIL_USER;

let mailTransporter: nodemailer.Transporter | null = null;
if (GMAIL_USER && GMAIL_PASS) {
  mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
} else {
  console.warn("GMAIL_USER / GMAIL_PASS not configured - email sending disabled.");
}

type NotifyPayload =
  | { type: "new_product"; product: any; broadcast?: boolean; title?: string; message?: string }
  | { type: "reservation"; reservation: any; user_id?: string; title?: string; message?: string }
  | { type: "account_change" | "address_updated"; user_id: string; title?: string; message?: string };

async function notifySingleUser(user: any, title: string, message: string, type: string) {
  const id = user?.id ?? null;
  const email = user?.email;
  const raw = user?.raw_user_meta_data ?? user?.user_metadata ?? {};
  const prefs = raw?.notifications ?? {};

  try {
    await supabaseAdmin.from("notifications").insert({
      title,
      message,
      type,
      recipient_id: id,
      is_read: false,
    });
  } catch (err) {
    console.error("failed to insert notification row:", err);
  }

  if (prefs?.emailEnabled && email && mailTransporter) {
    try {
      await mailTransporter.sendMail({
        from: GMAIL_FROM,
        to: email,
        subject: title,
        text: message,
        html: `<p>${message}</p>`,
      });
    } catch (err) {
      console.error("gmail send error", err);
    }
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NotifyPayload;
    if (!body || !("type" in body)) {
      return NextResponse.json({ error: "missing payload or type" }, { status: 400 });
    }

    const type = body.type;
    const titleDefault =
      type === "new_product" ? `New product: ${((body as any).product?.name) ?? ""}` : "Account update";
    const messageDefault =
      type === "new_product"
        ? `We added a new product: ${((body as any).product?.name) ?? ""}. Check it out on the site.`
        : "There was an update to your account.";

    const title = (body as any).title ?? titleDefault;
    const message = (body as any).message ?? messageDefault;

    if (type === "new_product") {
      const broadcast = (body as any).broadcast ?? true;
      const product = (body as any).product;
      if (product?.id) {
        try {
          const { data: existing, error: exErr } = await supabaseAdmin
            .from("reservations")
            .select("id")
            .eq("user_item_id", product.id)
            .limit(1);

          if (!existing || (Array.isArray(existing) && existing.length === 0)) {
            await supabaseAdmin.from("reservations").insert([{
              id: randomUUID(),
              user_id: null,
              user_item_id: product.id,
              name: product.name ?? null,
              last_name: "",
              phone: "",
              email: "",
              store_branch: "",
              type_of_product: product.category ?? null,
              product_model: product.fullproductname ?? null,
              width: product.width ?? null,
              height: product.height ?? null,
              remarks: "Auto-created reservation for new product"
            }]);
            console.log("auto reservation created for product", product.id);
          }
        } catch (resErr) {
          console.error("failed to create reservation for product (server):", resErr);
        }
      }

      if (broadcast) {
        const { data: users, error } = await supabaseAdmin
          .from("auth.users")
          .select("id, email, raw_user_meta_data");
        if (error) {
          console.error("fetch users error", error);
          return NextResponse.json({ error: (error as any).message }, { status: 500 });
        }
        for (const u of users ?? []) {
          // eslint-disable-next-line no-await-in-loop
          await notifySingleUser(u, title, message, type);
        }
        return NextResponse.json({ ok: true, sent: (users ?? []).length });
      }
      return NextResponse.json({ ok: true });
    }

    const userId = (body as any).user_id ?? (body as any).reservation?.user_id;
    if (!userId) return NextResponse.json({ error: "missing user_id" }, { status: 400 });

    const { data: user, error: userErr } = await supabaseAdmin
      .from("auth.users")
      .select("id, email, raw_user_meta_data")
      .eq("id", userId)
      .single();

    if (userErr || !user) {
      console.error("fetch user error", userErr);
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    await notifySingleUser(user, title, message, type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notifyServers route error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

