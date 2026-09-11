/* 店家後台的推播用 service worker。只做兩件事：
   1. 收到推播就跳系統通知（收到新訂單的時候，後端 finalizeSession 會推播）
   2. 點下通知就開/切到 vendor.html

   刻意寫得很單純——不快取任何檔案、不做離線支援，純粹只是瀏覽器推播
   API 要求「一定要有 service worker 才能訂閱」的技術性要求。 */

self.addEventListener('push', function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* 不是 JSON 格式就用預設文字 */ }

  const title = data.title || '嗷嗷早午餐店家後台';
  const options = {
    body: data.body || '有新訂單，點開來看看。',
    data: { url: data.url || 'vendor.html' },
    /* 用同一個 tag，短時間內連續送單也只會疊成一則通知、不會洗版手機，
       renotify 讓它疊上去時還是會再震動/響一次提醒店家。 */
    tag: 'aoao-new-order',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || 'vendor.html', self.location).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.indexOf('vendor.html') > -1 && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
