if (('serviceWorker' in navigator) && ('PushManager' in window)) {
    console.log('Service Worker is supported');

    var oddadviceIDB,
        openDBRequest,
        cachedNotificationDeferred,
        cachedNotificationListDeferred;

    $(".oddadvice-pwa.mdl-layout").removeClass("invisible");

    $(document).ready(function() {
        var controller = navigator.serviceWorker.controller;

        if (controller) {
            controller.postMessage("clientloaded");
        }
    });

    openDBRequest = indexedDB.open("oddadviceIDB", 1);
    openDBRequest.onupgradeneeded = function(e) {
        var thisDB = e.target.result;
        if (!thisDB.objectStoreNames.contains("notifications")) {
            thisDB.createObjectStore("notifications", {
                autoIncrement: true
            });

            console.log("FROM CLIENT - Successfully created object stores");
        }
    }
    openDBRequest.onsuccess = function(e) {
        console.log("FROM CLIENT: Successfully opened IndexedDB");
        oddadviceIDB = e.target.result;
    }
    openDBRequest.onerror = function(e) {
        console.log("FROM CLIENT: Error opening IndexedDB");
    }

    navigator.serviceWorker.register('/sw.js', {
        scope: '/'
    })
        .then(function(registrationObj) {
            console.log('sw.js registered. ', registrationObj);
        }).catch(function(error) {
            console.log('Error: ', error);
        });

    navigator.serviceWorker.ready.then(function(serviceWorkerRegistration) {
        var layout = document.querySelector('.mdl-layout');

        var deleteDataCache = function() {
            return caches.keys()
                .then(function(allCaches) {
                    allCaches.map(function(cacheName) {
                        if (cacheName == "oddadvice-data-cache" || cacheName == "oddadvice-account-cache") {
                            return caches.delete(cacheName);
                        }
                    });
                })
        }

        var deleteNotificationStore = function() {
            oddadviceIDB.transaction("notifications", "readwrite")
                .objectStore("notifications")
                .clear()
                .onsuccess = function(event) {
                console.log("Successfully cleared notifications IndexedDB store.");
            }
        };

        var getCachedNotificationList = function() {
            cachedNotificationListDeferred = new $.Deferred();
            oddadviceIDB.transaction("notifications")
                .objectStore("notifications")
                .getAll()
                .onsuccess = function(event) {
                cachedNotificationListDeferred.resolve(event.target.result);
            }
        };

        var getCachedNotification = function(announcementId) {
            cachedNotificationDeferred = new $.Deferred();
            oddadviceIDB.transaction("notifications")
                .objectStore("notifications")
                .get(announcementId)
                .onsuccess = function(event) {
                cachedNotificationDeferred.resolve(event.target.result);
            }
        }

        var updateNotificationProperty = function(announcementId, propertyName, propertyVal) {
            var objectStore = oddadviceIDB.transaction("notifications", "readwrite").objectStore("notifications");
            var request = objectStore.get(announcementId);

            request.onsuccess = function(event) {
                var data = event.target.result;
                data[propertyName] = propertyVal;

                var requestUpdate = objectStore.put(data, announcementId);
                requestUpdate.onsuccess = function(event) {
                    console.log("SUCCESSFULLY UPDATED NOTIFICATION ID " + announcementId + ": ", {
                        propertyName: propertyVal
                    });
                };
            }
        }

        var cacheNotification = function(messageObj, cacheDeferredObj) {
            var notificationsTransaction = oddadviceIDB.transaction("notifications", "readwrite");
            var store = notificationsTransaction.objectStore("notifications");
            var addRequest = store.add(messageObj, messageObj.announcementId);
            addRequest.onerror = function() {
                console.log("Error saving notification to IndexedDB");
                cacheDeferredObj.resolve(false);
            }
            addRequest.onsuccess = function() {
                console.log("Notification saved to IndexedDB");
                cacheDeferredObj.resolve(true);
            }
        }

        var assembleGameNumbers = function(gameType) {
            var template = $("#number-template").html();
            var limit = parseInt(gameType);
            var num = 1;

            $(".numbers-container").empty();

            while(num <= limit) {
                var numberItemMarkup = Mustache.to_html(template, {"number": num});

                $(".numbers-container").append(numberItemMarkup);
                num++;
            }
        }

        /*serviceWorkerRegistration.pushManager.getSubscription()
            .then(function(subscription) {
                $(".loading-overlay").removeClass("hidden");
                $(".mdl-card").hide();

                if (!subscription) {
                    $(".subscription-card").show()
                        .promise()
                        .done(function() {
                            $("#subscribe-btn").prop("disabled", true);
                        });
                    $(".loading-overlay").addClass("hidden");
                    return;
                }

                var profileObj = JSON.parse(localStorage.getItem("profile"));

                $(".employee-name").html(profileObj.firstName.toLowerCase() + " " + profileObj.lastName.toLowerCase());
                $(".unsubscribe-card, #unsubscribe-btn, #profile-btn, #inbox-btn").show();

                console.log(JSON.stringify(subscription));

                $("#profile-accountid").val(profileObj.accountId);
                $("#profile-firstname").val(profileObj.firstName);
                $("#profile-lastname").val(profileObj.lastName);

                $(".loading-overlay").addClass("hidden");
            })
            .catch(function(err) {
                console.log('Error during getSubscription()', err);
                $(".loading-overlay").addClass("hidden");
            });

            */


        $(".mdl-card").hide();
        $(".landing-card").show();
        $(".loading-overlay").addClass("hidden");

        $(".card-close-btn:not([id])").on("click", function(e) {
            e.preventDefault();

            $(this).parent().hide();
            $(".landing-card").show();
        });

        $("body").on("click", "#about-btn", function(e) {
            e.preventDefault();

            $(".mdl-card").hide();
            $(".about-card").show();

            layout.MaterialLayout.toggleDrawer();
        }).on("click", ".game-buttons", function(e) {
            var $srcElem = $(e.currentTarget);
            var gameType = $srcElem.data("game");
            var gameLabel = $srcElem.data("gamename");

            $(".mdl-card").hide();
            $(".back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
            $(".game-card-title, button", ".menu-card").attr({"data-game": gameType, "data-gamename": gameLabel})
                .data({"game": gameType, "gamename": gameLabel});

            $(".menu-card").show();

            if ($(".mdl-layout__drawer.is-visible").length) {
                layout.MaterialLayout.toggleDrawer();
            }
        }).on("click", ".choose-own-numbers", function(e) {
            var $srcElem = $(e.currentTarget);
            var gameType = $srcElem.data("game");
            var gameLabel = $srcElem.data("gamename");

            $(".mdl-card").hide();
            $(".numbers-card").data("game", gameType)
            $(".game-card-title", ".numbers-card").attr("data-gamename", gameLabel);

            assembleGameNumbers(gameType);

            $(".numbers-card").show();
        }).on("click", ".back-btn", function(e) {
            var prevCard = $(".mdl-card:visible").data("prevscreen");
            $(".mdl-card").hide();
            $(prevCard).show();

            if (prevCard == ".landing-card") {
                $(".back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
            }
        }).on("click", ".number-button", function(e) {
            var $srcElem = $(e.currentTarget);
            
            if (!$srcElem.hasClass("selected")) {
                if ($(".number-button.selected").length < 6) {
                    $srcElem.toggleClass("selected");
                    if ($(".number-button.selected").length == 6) {
                        $("#analyze-button").prop("disabled", false);
                        $(".mdl-layout__content").animate({ scrollTop: $('.mdl-layout__content').prop("scrollHeight")}, 1000);
                    } else {
                        $("#analyze-button").prop("disabled", true);
                    }
                }
            } else {
                $srcElem.toggleClass("selected");
            }

        })
    });
} else {
    $("header, footer").remove();
    $(".loading-overlay").addClass("hidden");
    $(".not-supported-card").show();
    $(".oddadvice-pwa.mdl-layout").removeClass("invisible");
}