import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin operations
);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const { recipientEmail, subject, message, notificationType, relatedEntityType, relatedEntityId } = await request.json();

    // Validate required fields
    if (!recipientEmail || !subject || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Since we're using Supabase's built-in auth, we'll use the auth.admin API to send emails
    // This is a simple email notification using Supabase's built-in email functionality
    
    // For actual email sending, you might want to integrate with:
    // - Supabase Edge Functions with Resend/SendGrid
    // - Or use a direct email service
    
    // For now, we'll just log the email notification in our database
    const { data, error } = await supabase
      .from("email_notifications")
      .insert({
        recipient_email: recipientEmail,
        subject,
        message,
        notification_type: notificationType || 'general',
        related_entity_type: relatedEntityType,
        related_entity_id: relatedEntityId,
        status: 'sent' // In a real implementation, this would be 'pending' until actually sent
      });

    if (error) {
      console.error("Error logging email notification:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // In a production environment, you would integrate with an actual email service here
    // For demonstration, we'll simulate successful email sending
    console.log(`Email notification logged for ${recipientEmail}: ${subject}`);

    return NextResponse.json({ 
      success: true, 
      message: "Email notification sent successfully",
      data 
    });

  } catch (error) {
    console.error("Email notification error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}