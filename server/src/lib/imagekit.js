import crypto from "crypto";

// ImageKit's client-side (browser) upload requires a short-lived signature
// generated with the PRIVATE key — this must happen server-side. The
// frontend calls GET /api/imagekit-auth to get one right before uploading.
export function getImageKitAuthParams() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes
  const signature = crypto
    .createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");
  return { token, expire, signature };
}
