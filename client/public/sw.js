// Service worker — only handles push events and notification clicks.
// Registered from client/src/lib/push.js.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    // Only hit if the payload isn't valid JSON at all — the normal path
    // (see server/src/lib/webpush.js) always sends { title, body, link }
    // as real JSON with title already set to "Nixie Dashboard".
    data = { title: "Nixie Dashboard", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Nixie Dashboard";
  const options = {
    body: data.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { link: data.link || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((allClients) => {
      const existing = allClients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        if ("navigate" in existing) existing.navigate(link);
      } else {
        self.clients.openWindow(link);
      }
    })
  );
});