import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The link in Supabase's sign-up confirmation email lands here. Exchanging it signs the user
// in (sets the session cookies), then they go to the meeting log. This only handles auth;
// no app data is read or written here.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    // Default email template (PKCE): Supabase verifies the link, then redirects here with a code.
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    // Custom email template linking straight here with {{ .TokenHash }}.
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  // If the code can't be exchanged (e.g. the link was opened in another browser), the email is
  // usually confirmed anyway, so signing in works.
  redirect(ok ? "/" : "/sign-in?notice=confirm-failed");
}
