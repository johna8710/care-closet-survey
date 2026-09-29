// New-response notification: composes the email (summary of the new submission plus
// the full report as an attachment) and hands it to graph-mail.js.
import { analyze, renderReport, responseFacts, districtOf, esc, para, stampDate, joinNames, DEFAULT_SINCE } from './report.js';
import { mailConfig, mailMissing, sendMail } from './graph-mail.js';

export function notifyConfig(env = process.env) {
  return { ...mailConfig(env), since: env.SURVEY_SENT_AT || DEFAULT_SINCE };
}

/** What the admin status endpoint reports. Never includes the secret. */
export function notifyStatus(env = process.env) {
  const cfg = notifyConfig(env);
  const missing = mailMissing(cfg);
  return { configured: missing.length === 0, missing, from: cfg.from ?? null, to: cfg.to, dryRun: cfg.dryRun, since: cfg.since };
}

const cell = (style, html) => `<td style="padding:7px 10px;border-bottom:1px solid #e4d7cb;vertical-align:top;font-size:14px;line-height:1.45;${style}">${html}</td>`;

/** Subject, HTML body and attachment for one new response. */
export function buildNotification(allRows, response, cfg = notifyConfig()) {
  const a = analyze(allRows, { since: cfg.since });
  const { name } = districtOf(response);
  const total = a.districts.length;
  const subject = `Care Closet survey: ${name} responded (${a.respondedIds.length} of ${total})`;
  const filename = `care-closet-report-${stampDate()}.html`;
  const pending = a.pendingIds.map(a.districtName);

  const rows = responseFacts(response)
    .map(({ label, text }) => `<tr>${cell('color:#6f5f52;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;width:130px', esc(label))}${cell('color:#1d0e03', para(text))}</tr>`)
    .join('');

  const html = `<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1d0e03;max-width:680px;background:#ffffff">
  <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6f5f52;font-weight:700">Let's Ketchup · Care Closet survey</p>
  <h2 style="margin:4px 0 6px;font-size:22px;line-height:1.2;color:#1d0e03">${esc(name)} just completed the Partner Check-In</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#4a3a2e">${a.respondedIds.length} of ${total} partners have now responded${pending.length ? `. Still to hear from: ${esc(joinNames(pending))}` : '. Every partner has responded'}.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border-top:1px solid #e4d7cb">${rows}</table>
  <p style="margin:16px 0 0;font-size:14px;color:#4a3a2e">The updated results report is attached (<strong>${esc(filename)}</strong>). Open it in a browser; it covers all ${a.n} response${a.n === 1 ? '' : 's'} so far, with budget splits, most-needed items, sizes, testimonials and an order sheet per district.</p>
  <p style="margin:18px 0 0;font-size:12px;color:#6f5f52">Sent automatically by the Care Closet survey app.</p>
</div>`;

  const report = renderReport(allRows, { since: cfg.since });
  return { subject, html, attachments: [{ name: filename, contentType: 'text/html', content: report }] };
}

/**
 * Send the notification for one stored response. `to` overrides the recipient list
 * (used by the admin test endpoint). Resolves to what happened; throws on send failure.
 */
export async function notifyNewResponse(store, responseId, { to } = {}) {
  const cfg = notifyConfig();
  const missing = mailMissing(cfg);
  if (missing.length) {
    console.warn(`[notify] not configured, skipping (missing ${missing.join(', ')})`);
    return { skipped: true, reason: `missing ${missing.join(', ')}` };
  }
  const all = await store.listResponses();
  const response = all.find((r) => r.id === responseId);
  if (!response) throw new Error(`Response ${responseId} not found.`);
  if (response.submittedAt < cfg.since) {
    return { skipped: true, reason: `submitted before SURVEY_SENT_AT (${cfg.since})` };
  }
  const msg = buildNotification(all, response, cfg);
  const recipients = to ? [to] : cfg.to;
  const result = await sendMail(cfg, { ...msg, to: recipients });
  console.log(`[notify] ${result.dryRun ? 'dry run' : 'sent'}: "${msg.subject}" -> ${recipients.join(', ')}`);
  return { ...result, subject: msg.subject, to: recipients, attachment: msg.attachments[0].name };
}

/** Fire-and-forget: never delays or fails the respondent's request. */
export function queueNotification(store, responseId) {
  setImmediate(() => {
    notifyNewResponse(store, responseId).catch((err) => console.error(`[notify] failed for ${responseId}:`, err?.message ?? err));
  });
}
