// Service worker mínimo: permite instalar o MASON como app. Não guarda dados da empresa em cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => new Response(
      "<meta name=viewport content='width=device-width'><body style='font-family:sans-serif;padding:24px'>" +
      "<h3>Sem conexão</h3><p>O MASON precisa de internet. Tente novamente quando estiver conectado.</p></body>",
      {headers: {"Content-Type": "text/html; charset=utf-8"}})));
  }
});
