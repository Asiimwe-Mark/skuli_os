/**
 * Server-side QR code generation.
 *
 * Audit §14.4: the receipt PDF previously fetched
 * `https://api.qrserver.com/v1/create-qr-code/...` at render time.
 * That made the PDF generator dependent on a third-party CDN
 * (privacy + reliability concern: a CDN outage means no receipts;
 * the CDN also sees every receipt's verify-URL, which is a PII
 * leak adjacent to the receipt_number).
 *
 * The `qrcode` package has no native dependencies and runs in pure
 * JS. We pre-render the QR to a PNG data URL on the server and pass
 * the data URL to the PDF template. The PDF generator never touches
 * the network for this asset.
 *
 * If the `qrcode` package is unavailable (uncommon — it's a tiny,
 * widely-deployed module) we fall back to null and the caller
 * omits the QR code section. The receipt still includes the
 * receipt_number as a human-typed fallback.
 */

import type QRCode from "qrcode";

let cachedQrcode: typeof QRCode | null = null;

async function loadQrcode(): Promise<typeof QRCode | null> {
  if (cachedQrcode) return cachedQrcode;
  try {
    // Dynamic import so the package is only loaded by the small
    // number of routes that need to render a receipt.
    cachedQrcode = (await import("qrcode")) as typeof QRCode;
    return cachedQrcode;
  } catch {
    return null;
  }
}

export async function generateQrDataUrl(
  text: string,
  options: { size?: number; margin?: number } = {},
): Promise<string | null> {
  const qrcode = await loadQrcode();
  if (!qrcode) return null;
  try {
    return await qrcode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: options.margin ?? 1,
      width: options.size ?? 240,
      color: { dark: "#0B1220", light: "#FFFFFF" },
    });
  } catch {
    return null;
  }
}
