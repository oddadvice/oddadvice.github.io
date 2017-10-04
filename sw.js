var openDBRequest,
    oddadviceIDB,
    staticCache = "oddadvice-static-cache",
    dataImageCache = "oddadvice-data-cache",
    accountCache = "oddadvice-account-cache",
    restBaseUrl = "https://lotto.fossil-cloud.net",
    messageData,
    filesToCache = [
      '/index.html',
      '/index.html?homescreen=1',
      '/?homescreen=1',
      '/?utm_source=web_app_manifest',
      '/images/logo.svg',
      '/images/logo-32x32.png',
      '/images/logo-72x72.png',
      '/images/logo-192x192.png',
      '/images/logo-512x512.png',
      '/images/team-jackd-logo.svg',
      '/images/asurion-logo-white.svg',
      '/images/about-img.gif',
      '/images/oddadvice-icon.png',
      '/css/style.css',
      '/css/material.min.css',
      '/js/jquery.min.js',
      '/js/lodash.min.js',
      '/js/main.js',
      '/js/material.min.js',
      '/js/mustache.min.js',
      '/fonts/material-icons.woff2'
    ];

self.addEventListener("install", function(event) {
  console.log("Event: Install");

  event.waitUntil(
      self.skipWaiting(),
      caches.open(staticCache)
          .then(function(cache) {
            return cache.addAll(filesToCache.map(function(fileUrl) {
              return new Request(fileUrl);
            }))
                .then(function() {
                  console.log("All the static files are cached.");
                })
                .catch(function(error) {
                  console.error("Failed to cache the static files.", error);
                })
          })
  );
});

//Activate event to delete old caches
self.addEventListener("activate", function(event) {
  console.log("Event: Activate");

  openDBRequest = indexedDB.open("oddadviceIDB", 1);
  openDBRequest.onsuccess = function(e) {
    oddadviceIDB = e.target.result;
    console.log("FROM SW - Successfully opened IndexedDB");
  }
  openDBRequest.onerror = function(e) {
    console.log("FROM SW - Error opening IndexedDB");
  }

  var cacheWhitelist = ["oddadvice-static-cache"];

  //Delete unwanted caches
  event.waitUntil(
      self.clients.claim(),
      caches.keys()
          .then(function(allCaches) {
            allCaches.map(function(cacheName) {
              if (cacheWhitelist.indexOf(cacheName) === -1) {
                return caches.delete(cacheName);
              }
            });
          })
  );
});

self.addEventListener('fetch', function(event) {
  console.log('Event: Fetch', event.request.url);

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                var fetchRequest = event.request.clone();

                // Cache hit - return response
                if (response) {
                    var onlineResponse = self.updateStorageCache(fetchRequest, staticCache);

                    return response;
                } else {
                    return self.updateStorageCache(fetchRequest, staticCache);
                }
            })
    );

});

self.addEventListener('message', function(event) {
  console.log("Event: PostMessage", event);
  if (event.data == "clientloaded" && messageData !== null) {
    self.clients.matchAll()
        .then(function(clientList) {
          clientList.forEach(function(client) {
            client.postMessage(messageData);
          })
          messageData = null;
        })
  }
});

self.updateStorageCache = function(request, cacheName) {
  console.log("updateStorageCache called for: ", cacheName);
  var requestURL = new URL(request.url);

  return fetch(request).then(
      function(response) {
        // Check if we received a valid response
        if (!response) {
          return response;
        } else {
          if (response.type === "basic" && response.status === 200) {
            console.log("CACHING oddadvice STATIC FILES");
          } else if (response.type === "opaque" && requestURL.hostname.indexOf("oddadvice") > -1) {
            console.log("CACHING IMAGE FROM oddadvice-rest.herokuapp.com")
          } else {
            return response;
          }
        }

        var responseToCache = response.clone();

        caches.open(cacheName)
            .then(function(cache) {
              console.log("CACHENAME: ", cacheName);
              cache.put(request, responseToCache);
            });

        return response;
      }
  )
}