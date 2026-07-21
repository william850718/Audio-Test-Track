// AC Lab Tracker — Edge Function: send a Web Push when a new record is inserted.
// Deploy path (Supabase CLI): supabase/functions/notify-push/index.ts
//
// Required function secrets (set with `supabase secrets set` or in the dashboard):
//   VAPID_PUBLIC_KEY   - the public VAPID key (also embedded in index.html)
//   VAPID_PRIVATE_KEY  - the private VAPID key (keep secret!)
//   VAPID_SUBJECT      - a contact URL/email, e.g. "mailto:you@company.com"
//   APP_URL            - your app's URL, e.g. "https://user.github.io/repo/"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase database webhook payload: { type, table, record, old_record, ... }
    if (payload.type !== "INSERT" || payload.table !== "records") {
      return new Response("ignored", { status: 200 });
    }

    const data = (payload.record && payload.record.data) || {};
    const platform = data.platform || "";
    const title = data.title || "New record";
    const by = data.updatedBy || "";
    const body = `${platform ? platform + " · " : ""}${title}${by ? " — " + by : ""}`;

    const message = JSON.stringify({
      title: "AudioTracker — new record",
      body,
      url: Deno.env.get("APP_URL") || "./",
      tag: "aclab-record",
    });

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    if (error) throw error;

    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        );
      } catch (e) {
        // 404 / 410 = subscription expired or unsubscribed -> clean it up
        const code = (e && (e.statusCode || e.status)) || 0;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("push send failed", code, e && e.body);
        }
      }
    }));

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e?.message || e), { status: 500 });
  }
});
