import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const ADMIN_EMAIL = "martin@getlavado.com";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  // Verify admin access
  const authHeader = request.headers.get("authorization");
  let isAdmin = false;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    isAdmin = user?.email === ADMIN_EMAIL;
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userIds, dryRun = true, scheduledAt } = body;

    // Calculate scheduledAt if provided (ISO string or relative like "8am")
    let scheduleDate: Date | undefined;
    if (scheduledAt) {
      if (scheduledAt.includes("T")) {
        // Full ISO string
        scheduleDate = new Date(scheduledAt);
      } else if (scheduledAt.match(/^\d{1,2}(am|pm)$/i)) {
        // Simple format like "8am" or "2pm" - schedule for today/tomorrow Peru time (UTC-5)
        const match = scheduledAt.match(/^(\d{1,2})(am|pm)$/i);
        if (match) {
          let hour = parseInt(match[1]);
          const isPM = match[2].toLowerCase() === "pm";
          if (isPM && hour !== 12) hour += 12;
          if (!isPM && hour === 12) hour = 0;

          // Create date in Peru timezone (UTC-5)
          const now = new Date();
          const peruOffset = -5 * 60; // minutes
          const peruNow = new Date(now.getTime() + (peruOffset + now.getTimezoneOffset()) * 60000);

          scheduleDate = new Date(peruNow);
          scheduleDate.setHours(hour, 0, 0, 0);

          // If the time has passed today, schedule for tomorrow
          if (scheduleDate <= peruNow) {
            scheduleDate.setDate(scheduleDate.getDate() + 1);
          }

          // Convert back to UTC for Resend
          scheduleDate = new Date(scheduleDate.getTime() - (peruOffset + now.getTimezoneOffset()) * 60000);
        }
      }
    }

    // Get users to email
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const users = authUsers?.users || [];

    // Get experiments to filter users with 0 objectives
    const { data: experiments } = await supabase
      .from("experiments")
      .select("user_id")
      .is("deleted_at", null);

    const usersWithObjectives = new Set(experiments?.map(e => e.user_id) || []);

    // Filter: users with 0 objectives (or specific userIds if provided)
    let targetUsers = users.filter(u => {
      if (userIds && userIds.length > 0) {
        return userIds.includes(u.id);
      }
      return !usersWithObjectives.has(u.id) && u.email;
    });

    // Don't email yourself
    targetUsers = targetUsers.filter(u => u.email !== ADMIN_EMAIL);

    if (targetUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users to email",
        sent: 0,
      });
    }

    const results: { email: string; success: boolean; error?: string }[] = [];
    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const user of targetUsers) {
      if (!user.email) continue;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; padding: 32px; border: 1px solid #334155;">

    <h1 style="color: #f1f5f9; font-size: 24px; margin: 0 0 24px 0; font-weight: 600;">
      Tu coach personal te espera
    </h1>

    <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola,
    </p>

    <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
      Te escribo porque vi que creaste tu cuenta en Vicu pero no creaste ningún objetivo todavía.
    </p>

    <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
      Quería preguntarte: <strong style="color: #e2e8f0;">¿qué te detuvo?</strong>
    </p>

    <ul style="color: #94a3b8; font-size: 15px; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px;">
      <li>¿No sabías qué poner?</li>
      <li>¿Algo no funcionó bien?</li>
      <li>¿El chat era muy largo?</li>
    </ul>

    <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Respóndeme directamente a este email. Me ayuda mucho a mejorar Vicu.
    </p>

    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; padding: 20px; margin: 0 0 24px 0;">
      <p style="color: #ffffff; font-size: 14px; margin: 0 0 12px 0; opacity: 0.9;">
        Mientras tanto, esto es lo que puedes hacer:
      </p>
      <p style="color: #ffffff; font-size: 16px; margin: 0; font-weight: 500;">
        Crea un objetivo en 30 segundos y te envío tu primer paso por WhatsApp mañana.
      </p>
    </div>

    <a href="https://vicu.app/vicu" style="display: block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 16px 24px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center; margin: 0 0 24px 0;">
      Crear mi objetivo →
    </a>

    <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0;">
      Saludos,<br>
      <strong style="color: #94a3b8;">Martin</strong><br>
      <span style="font-size: 13px;">Creador de Vicu</span>
    </p>

  </div>

  <p style="color: #475569; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
    Vicu - Tu coach de productividad personal
  </p>
</body>
</html>
`;

      if (dryRun) {
        results.push({ email: user.email, success: true, error: "dry-run" });
      } else {
        try {
          const emailOptions: Parameters<typeof resend.emails.send>[0] = {
            from: "Martin de Vicu <martin@vicu.app>",
            to: user.email,
            subject: "¿Qué te detuvo?",
            html: emailHtml,
            replyTo: "martin@getlavado.com",
          };

          // Add scheduling if provided
          if (scheduleDate) {
            emailOptions.scheduledAt = scheduleDate.toISOString();
          }

          await resend.emails.send(emailOptions);
          results.push({ email: user.email, success: true });
        } catch (err) {
          results.push({ email: user.email, success: false, error: String(err) });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      dryRun,
      scheduled: scheduleDate ? scheduleDate.toISOString() : null,
      total: targetUsers.length,
      sent: successCount,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    console.error("Send reengagement error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET - Preview users that would receive the email
export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  // Verify admin access
  const authHeader = request.headers.get("authorization");
  let isAdmin = false;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    isAdmin = user?.email === ADMIN_EMAIL;
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get users
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const users = authUsers?.users || [];

    // Get experiments
    const { data: experiments } = await supabase
      .from("experiments")
      .select("user_id")
      .is("deleted_at", null);

    const usersWithObjectives = new Set(experiments?.map(e => e.user_id) || []);

    // Users with 0 objectives
    const targetUsers = users
      .filter(u => !usersWithObjectives.has(u.id) && u.email && u.email !== ADMIN_EMAIL)
      .map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      }));

    return NextResponse.json({
      success: true,
      count: targetUsers.length,
      users: targetUsers,
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
