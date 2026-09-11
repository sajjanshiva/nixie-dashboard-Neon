// Client Credentials Grant — for a server-side app acting on a store in
// your OWN Shopify organization (Dev Dashboard apps, not Partner-distributed
// apps for other merchants). No OAuth redirect needed: exchange
// SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET directly for a token.
//
// The token expires after 24 hours, so it's cached in memory and
// re-requested automatically once it's close to expiring. Every Shopify
// Admin API call should go through getShopifyAccessToken() rather than
// reading a static token from env.
//
// Docs: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant

let cachedToken = null;
let cachedExpiresAt = 0; // epoch ms

export async function getShopifyAccessToken() {
    const now = Date.now();
    // Refresh a little early (60s buffer) rather than right at expiry.
    if (cachedToken && now < cachedExpiresAt - 60_000) {
        return cachedToken;
    }

    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!domain || !clientId || !clientSecret) {
        throw new Error("SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET must all be set");
    }

    const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
        }).toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify token request failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    cachedToken = data.access_token;
    // Shopify returns expires_in in seconds (currently ~86399, i.e. 24h).
    cachedExpiresAt = now + data.expires_in * 1000;
    return cachedToken;
}

// Convenience helper for calling the Admin REST/GraphQL API with the
// current token automatically attached.
export async function shopifyAdminFetch(path, options = {}) {
    const token = await getShopifyAccessToken();
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const version = process.env.SHOPIFY_API_VERSION || "2026-01";
    const url = `https://${domain}/admin/api/${version}${path}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify Admin API error: ${res.status} ${text}`);
    }
    return res.json();
}