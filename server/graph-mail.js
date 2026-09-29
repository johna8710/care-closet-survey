// Sends mail from a Microsoft 365 mailbox through Microsoft Graph, using an Entra app
// registration with the application permission Mail.Send (client-credentials flow).
//
//   MS_TENANT_ID      Directory (tenant) ID of the LetsKetchup.org tenant
//   MS_CLIENT_ID      Application (client) ID of the app registration
//   MS_CLIENT_SECRET  a client secret's Value (not its Secret ID)
//   MAIL_FROM         the mailbox to send from, e.g. John_Adams@LetsKetchup.org
//   NOTIFY_TO         comma-separated recipients (defaults to MAIL_FROM)
//   NOTIFY_DRY_RUN    "1" logs the message instead of sending it
//
// Uses Node 20's global fetch; no dependency.
const GRAPH = 'https://graph.microsoft.com/v1.0';
const tokenUrl = (tenant) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;

const splitList = (s) =>
  String(s ?? '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function mailConfig(env = process.env) {
  return {
    tenantId: env.MS_TENANT_ID,
    clientId: env.MS_CLIENT_ID,
    clientSecret: env.MS_CLIENT_SECRET,
    from: env.MAIL_FROM,
    to: splitList(env.NOTIFY_TO || env.MAIL_FROM),
    dryRun: env.NOTIFY_DRY_RUN === '1' || env.NOTIFY_DRY_RUN === 'true',
  };
}

/** Names of the env vars still missing, or [] when mail can be sent. */
export function mailMissing(cfg) {
  const names = { tenantId: 'MS_TENANT_ID', clientId: 'MS_CLIENT_ID', clientSecret: 'MS_CLIENT_SECRET', from: 'MAIL_FROM' };
  return Object.keys(names).filter((k) => !cfg[k]).map((k) => names[k]);
}

let cache = { token: null, expiresAt: 0 };

export async function getToken(cfg) {
  if (cache.token && Date.now() < cache.expiresAt - 60_000) return cache.token;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(tokenUrl(cfg.tenantId), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Microsoft token request failed (${res.status}): ${json.error_description ?? json.error ?? 'no access_token in reply'}`);
  }
  cache = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return cache.token;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send one HTML email. `attachments` is [{ name, contentType, content }] where content
 * is a string or Buffer. Resolves { status: 202 } on success (Graph returns no body),
 * or { dryRun: true } when NOTIFY_DRY_RUN is set. Retries once on 429 / 5xx / network.
 */
export async function sendMail(cfg, { subject, html, to, attachments = [] }) {
  const recipients = (to?.length ? to : cfg.to).filter(Boolean);
  if (!recipients.length) throw new Error('No recipients: set NOTIFY_TO (or MAIL_FROM).');
  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    attachments: attachments.map((f) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: f.name,
      contentType: f.contentType ?? 'application/octet-stream',
      contentBytes: Buffer.isBuffer(f.content) ? f.content.toString('base64') : Buffer.from(String(f.content), 'utf8').toString('base64'),
    })),
  };
  if (cfg.dryRun) {
    console.log(`[mail] dry run: would send "${subject}" from ${cfg.from} to ${recipients.join(', ')} with ${attachments.length} attachment(s)`);
    return { dryRun: true, status: 0, to: recipients };
  }
  const token = await getToken(cfg);
  const url = `${GRAPH}/users/${encodeURIComponent(cfg.from)}/sendMail`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
    } catch (err) {
      if (attempt >= 2) throw err;
      await wait(3000);
      continue;
    }
    if (res.status === 202) return { status: 202, to: recipients };
    const text = await res.text().catch(() => '');
    const err = new Error(`Graph sendMail failed (${res.status}): ${text.slice(0, 500)}`);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 2) throw err;
    await wait(3000);
  }
}
