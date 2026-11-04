/**
 * Schritt 2.3 · E-Mails über Brevo (Login-Links, Einladungen).
 * Vercel: BREVO_API_KEY und LOGIN_ABSENDER (in Brevo bestätigte Absenderadresse).
 */

export function mailEingerichtet(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.LOGIN_ABSENDER);
}

export type Anhang = { name: string; inhaltBase64: string };

export async function sendeMail(an: { email: string; name?: string }, betreff: string, html: string, text: string, anhaenge: Anhang[] = []): Promise<void> {
  if (!mailEingerichtet()) throw new Error("E-Mail-Versand nicht eingerichtet: BREVO_API_KEY und LOGIN_ABSENDER in Vercel setzen.");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY as string, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.LOGIN_ABSENDER, name: process.env.LOGIN_ABSENDER_NAME || "Career Inbox" },
      to: [{ email: an.email, ...(an.name ? { name: an.name } : {}) }],
      subject: betreff,
      htmlContent: html,
      textContent: text,
      ...(anhaenge.length ? { attachment: anhaenge.map((a) => ({ name: a.name, content: a.inhaltBase64 })) } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const grund = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${grund.slice(0, 200)}`);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Schlichte Mail mit einem Knopf. */
export function linkMail(o: { anrede: string; absatz: string; knopf: string; link: string; fuss: string }): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#fbfbf9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#16181d">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:13px;color:#6b6f76;margin:0 0 16px">Career Inbox</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(o.anrede)}</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">${esc(o.absatz)}</p>
<p style="margin:0 0 24px"><a href="${esc(o.link)}" style="display:inline-block;background:#16181d;color:#fbfbf9;text-decoration:none;padding:12px 20px;border-radius:4px;font-size:15px">${esc(o.knopf)}</a></p>
<p style="font-size:12px;line-height:1.5;color:#6b6f76;margin:0">${esc(o.fuss)}</p>
</div></body></html>`;
  const text = `${o.anrede}\n\n${o.absatz}\n\n${o.knopf}: ${o.link}\n\n${o.fuss}`;
  return { html, text };
}
