import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with your App Secret and sends the
 * result in the `x-hub-signature-256: sha256=<hex>` header. Without
 * verification, anyone who knows our webhook URL can POST fabricated
 * status updates and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * Contract:
 *   A secret is required. Prefer the App Secret saved on the WhatsApp
 *   configuration (`secretOverride`). `META_APP_SECRET` is only the
 *   fallback when that row has none. If both are missing we fail
 *   closed — every request is rejected. A previous version fell open
 *   with a warning log, which is unsafe: anyone who forgets the secret
 *   would be running a fully spoofable webhook.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretOverride?: string | null,
): boolean {
  const secret = secretOverride?.trim() || process.env.META_APP_SECRET
  if (!secret) {
    console.error(
      '[webhook] No Meta App Secret — rejecting request. ' +
        'Save it in Configurações → WhatsApp, or set META_APP_SECRET.',
    )
    return false
  }

  if (!signatureHeader) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  // Bail if lengths differ — timingSafeEqual throws otherwise.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
