self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = JSON.parse(event.data ? event.data.text() : "{}");
    } catch {
      payload = {};
    }
  }

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  const title =
    typeof payload.title === "string" ? payload.title : "Komben Live";

  const body =
    typeof payload.body === "string" ? payload.body : "";

  const url =
    typeof payload.url === "string" ? payload.url : "/";

  const tag =
    typeof payload.tag === "string" ? payload.tag : "komben-place-t3";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: "/icon-192.png",
      badge: "/badge-96.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }

          if ("focus" in client) {
            return client.focus();
          }
        }

        return clients.openWindow(targetUrl);
      }),
  );
});
