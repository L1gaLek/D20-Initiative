import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Bad url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Allow only the configured source domain (и поддомены)
    const host = parsed.hostname.toLowerCase();
    if (!(host === "dnd.su" || host.endsWith(".dnd.su"))) {
      return new Response(JSON.stringify({ ok: false, error: "Host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const upstream = await fetch(parsed.href, {
      headers: {
        "user-agent": "Mozilla/5.0 (Initiative-GAME)",
        "accept": "text/html,application/xhtml+xml",
      },
    });

    const html = await upstream.text();

    return new Response(JSON.stringify({ ok: true, status: upstream.status, html }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  }
});
