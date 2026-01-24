import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Fix corrupted phone numbers in whatsapp_config table
 *
 * Common issues:
 * - +5151999888777 (51 duplicated for Peru)
 * - +51573... (Peru code + Colombia code mixed)
 * - Numbers too long (user entered country code when UI already adds it)
 *
 * Valid phone lengths:
 * - Peru (51): 51 + 9 digits = 11 total
 * - Colombia (57): 57 + 10 digits = 12 total
 * - Mexico (52): 52 + 10 digits = 12 total
 * - Argentina (54): 54 + 10-11 digits = 12-13 total
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

  // Country code info: code -> expected total length (code + local number)
  const countryLengths: Record<string, number> = {
    "51": 11,  // Peru: 51 + 9 digits
    "57": 12,  // Colombia: 57 + 10 digits
    "52": 12,  // Mexico: 52 + 10 digits
    "54": 13,  // Argentina: 54 + 10-11 digits (use max)
    "56": 11,  // Chile: 56 + 9 digits
    "55": 13,  // Brazil: 55 + 10-11 digits
  };

  for (const config of configs || []) {
    const phone = config.phone_number || "";
    let newPhone = phone;
    let issue = "";

    // Remove + if present for analysis
    const cleanPhone = phone.replace(/^\+/, "");
    const countryCode = cleanPhone.slice(0, 2);
    const expectedLength = countryLengths[countryCode];

    // Check for duplicate country codes (consecutive)
    // Peru: 51 duplicated -> 5151...
    if (cleanPhone.startsWith("5151")) {
      newPhone = "+" + cleanPhone.slice(2);
      issue = "Duplicate Peru code (5151)";
    }
    // Colombia: 57 duplicated -> 5757...
    else if (cleanPhone.startsWith("5757")) {
      newPhone = "+" + cleanPhone.slice(2);
      issue = "Duplicate Colombia code (5757)";
    }
    // Peru + Colombia mixed: 5157...
    else if (cleanPhone.startsWith("5157") && cleanPhone.length > 12) {
      newPhone = "+" + cleanPhone.slice(2);
      issue = "Peru code prepended to Colombia number";
    }
    // Colombia + Peru mixed: 5751...
    else if (cleanPhone.startsWith("5751") && cleanPhone.length > 12) {
      newPhone = "+" + cleanPhone.slice(2);
      issue = "Colombia code prepended to Peru number";
    }
    // Check if number is too long for its country code
    else if (expectedLength && cleanPhone.length > expectedLength + 2) {
      // Number is at least 3 digits too long - likely has duplicate country code
      // Try to find where the real number starts
      const excess = cleanPhone.length - expectedLength;

      // Check if removing the first N digits results in a valid number
      const potentialFixed = cleanPhone.slice(excess);
      if (potentialFixed.startsWith(countryCode)) {
        newPhone = "+" + potentialFixed;
        issue = `Number too long (${cleanPhone.length} digits, expected ${expectedLength}), removed ${excess} leading digits`;
      } else {
        // Try removing just the country code duplicate
        const withoutPrefix = cleanPhone.slice(2);
        if (withoutPrefix.length <= expectedLength + 1) {
          newPhone = "+" + withoutPrefix;
          issue = `Number too long, removed country code prefix`;
        }
      }
    }
    // Generic check for very long numbers
    else if (cleanPhone.length > 14) {
      // Try removing the first 2 digits (likely duplicate country code)
      const fixed = cleanPhone.slice(2);
      if (fixed.length >= 10 && fixed.length <= 13) {
        newPhone = "+" + fixed;
        issue = `Very long number (${cleanPhone.length} digits), removed first 2 digits`;
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
