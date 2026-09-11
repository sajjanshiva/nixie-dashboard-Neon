// Service worker — only handles push events and notification clicks.
// Registered from client/src/lib/push.js.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Nixie Teamflow", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Nixie Teamflow";
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