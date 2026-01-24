import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Fix corrupted phone numbers in whatsapp_config table
 *
 * Common issues:
 * - +5151999888777 (51 duplicated for Peru)
 * - +51573... (Peru code + Colombia code mixed)
 *
 * Run with: GET /api/admin/fix-phones?dry_run=true (to preview)
 * Run with: GET /api/admin/fix-phones (to actually fix)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry_run") === "true";

  const { data: configs, error } = await supabaseServer
    .from("whatsapp_config")
    .select("id, user_id, phone_number")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fixes: Array<{
    user_id: string;
    old_phone: string;
    new_phone: string;
    issue: string;
  }> = [];

  for (const config of configs || []) {
    const phone = config.phone_number || "";
    let newPhone = phone;
    let issue = "";

    // Remove + if present for analysis
    const cleanPhone = phone.replace(/^\+/, "");

    // Check for duplicate country codes
    // Peru: 51 duplicated -> 5151...
    if (cleanPhone.startsWith("5151")) {
      newPhone = "+" + cleanPhone.slice(2); // Remove first "51"
      issue = "Duplicate Peru code (5151)";
    }
    // Colombia: 57 duplicated -> 5757...
    else if (cleanPhone.startsWith("5757")) {
      newPhone = "+" + cleanPhone.slice(2);
      issue = "Duplicate Colombia code (5757)";
    }
    // Peru + Colombia mixed: 5157...
    else if (cleanPhone.startsWith("5157") && cleanPhone.length > 12) {
      // This is likely a Colombian number with Peru code prepended
      // Colombian numbers: 57 + 10 digits = 12 total
      newPhone = "+" + cleanPhone.slice(2); // Remove "51", keep "57..."
      issue = "Peru code prepended to Colombia number";
    }
    // Colombia + Peru mixed: 5751...
    else if (cleanPhone.startsWith("5751") && cleanPhone.length > 12) {
      newPhone = "+" + cleanPhone.slice(2);
      issue = "Colombia code prepended to Peru number";
    }
    // Check for numbers that are too long (likely have duplicate codes)
    else if (cleanPhone.length > 13) {
      // Try to detect and fix
      const countryCode = cleanPhone.slice(0, 2);
      if (cleanPhone.slice(2, 4) === countryCode) {
        newPhone = "+" + cleanPhone.slice(2);
        issue = `Duplicate country code (${countryCode})`;
      }
    }

    if (newPhone !== phone) {
      fixes.push({
        user_id: config.user_id,
        old_phone: phone,
        new_phone: newPhone,
        issue,
      });

      if (!dryRun) {
        await supabaseServer
          .from("whatsapp_config")
          .update({ phone_number: newPhone })
          .eq("id", config.id);
      }
    }
  }

  return NextResponse.json({
    dry_run: dryRun,
    total_configs: configs?.length || 0,
    fixes_needed: fixes.length,
    fixes,
    message: dryRun
      ? "Dry run - no changes made. Remove ?dry_run=true to apply fixes."
      : `Applied ${fixes.length} fixes.`,
  });
}
