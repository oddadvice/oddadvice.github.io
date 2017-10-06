$(document).ready(function() {
    var audio = new Audio('../audio/flush.mp3');
    var layout = document.querySelector('.mdl-layout');

    var oddadviceIDB,
        openDBRequest,
        cachedNotificationDeferred,
        cachedNotificationListDeferred;

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

    var showAdvice = function(gameType, gameLabel, data) {
        var combiTestTemplate = $("#combination-tests-template").html();
        var numTestTemplate = $("#numbers-tests-template").html();

        $(".advice-combination-container").empty();
        $(".advice-numbers-container").empty();

        if (data) {
            if (data["groupAdvises"].length) {
                data["groupAdvises"].forEach(function(a) {
                    if (a.additional.sum) {
                        var lowWidthPct = ((a.additional.lowLimitSum / a.additional.highLimitSum) * 100);
                        var highWidthPct = (100 - lowWidthPct);
                        a.highWidthPct = highWidthPct + "%";
                        a.sumPosition = "left";

                        if (a.additional.sum > a.additional.highLimitSum) {
                            a.sumPosition = "right";
                        }
                    }

                    var groupTestMarkup = Mustache.to_html(combiTestTemplate, a);

                    $(".advice-combination-container").append(groupTestMarkup);
                });
            }

            if (data["numberAdvises"].length) {
                data["numberAdvises"].forEach(function(b) {
                    var numberTestMarkup = Mustache.to_html(numTestTemplate, b);

                    $(".advice-numbers-container").append(numberTestMarkup);
                });
            }

            $(".mdl-card").hide();
            $(".mdl-layout__content").scrollTop(0);
            $(".advice-card").data({"game": gameType, "gamename": gameLabel});
            $(".game-card-title", ".advice-card").attr("data-gamename", gameLabel);
            $(".advice-card").show();
        }
    }

    var showRandomCombination = function(gameType, gameLabel, data) {
        if (data) {
            $(".mdl-card").hide();
            var template = $("#random-number-template").html();

            $(".random-numbers-container").empty();
            if (data.optimizedNumberCombination) {
                var count = 0;
                data.optimizedNumberCombination.sort(function(a, b) {
                    return a - b;
                }).forEach(function(x) {
                    var numberItemMarkup = Mustache.to_html(template, {"number": x});

                    if (count == 2) {
                        numberItemMarkup = numberItemMarkup + "<br/>";
                    }

                    $(".random-numbers-container").append(numberItemMarkup);
                    count++;
                })
            }
            $(".game-card-title", ".random-card").attr("data-gamename", gameLabel);
            $(".random-card, .random-numbers").data({"game": gameType, "gamename": gameLabel})
                .show();
        }
    }

    if (('serviceWorker' in navigator) && ('PushManager' in window)) {
        console.log('Service Worker is supported');

        var controller = navigator.serviceWorker.controller;

        if (controller) {
            controller.postMessage("clientloaded");
        }

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
            $(".oddadvice-pwa.mdl-layout").removeClass("invisible");
            $(".mdl-card").hide();
            $(".landing-card").show();
            $(".loading-overlay").addClass("hidden");
        });
    } else {
        $(".oddadvice-pwa.mdl-layout").removeClass("invisible");
        $(".mdl-card").hide();
        $(".landing-card").show();
        $(".loading-overlay").addClass("hidden");
    }

    $("body").on("click", "#about-btn", function(e) {
        e.preventDefault();

        $(".mdl-card").hide();
        $(".about-card").show();

        layout.MaterialLayout.toggleDrawer();
    }).on("click", ".card-close-btn:not([id])", function(e) {
        e.preventDefault();

        $(this).parent().hide();
        $(".landing-card").show();
    }).on("click", ".game-buttons", function(e) {
        var $srcElem = $(e.currentTarget);
        var gameType = $srcElem.data("game");
        var gameLabel = $srcElem.data("gamename");

        setTimeout(function() {
            $(".mdl-card").hide();
            $(".back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
            $(".menu-card").data({"game": gameType, "gamename": gameLabel});
            $(".game-card-title, button", ".menu-card").attr({"data-game": gameType, "data-gamename": gameLabel})

            $(".menu-card").show();

            if ($(".mdl-layout__drawer.is-visible").length) {
                layout.MaterialLayout.toggleDrawer();
            }
        }, 250)

    }).on("click", ".choose-own-numbers", function(e) {
        var $srcElem = $(e.currentTarget);
        var gameType = $srcElem.parents(".game-card").data("game");
        var gameLabel = $srcElem.parents(".game-card").data("gamename");

        setTimeout(function() {
            $(".mdl-card").hide();
            $(".numbers-card").data({"game": gameType, "gamename": gameLabel});
            $(".game-card-title", ".numbers-card").attr("data-gamename", gameLabel);

            assembleGameNumbers(gameType);

            $(".numbers-card").show();
        }, 250)

    }).on("click", ".back-btn", function(e) {
        var prevCard = $(".mdl-card:visible").data("prevscreen");
        $(".mdl-card").hide();
        $(prevCard).show();

        if (prevCard == ".landing-card") {
            $(".back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
        }

        $(".mdl-layout__content").scrollTop(0);
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
            if ($(".number-button.selected").length < 6) {
                $("#analyze-button").prop("disabled", true);
            }
        }
    }).on("click", ".mdl-mini-footer .mdl-logo", function() {
        audio.pause();
        audio.currentTime = 0;
        audio.play();
    }).on("click", "#analyze-button", function(e) {
        var gameType = $(".numbers-card").data("game");
        var gameLabel = $(".numbers-card").data("gamename");

        var data = {
            bets: [],
            game: parseInt(gameType)
        };

        $(".number-button.selected").each(function() {
            data.bets.push($(this).data("numval"));
        });

        $.ajax({
            type: "POST",
            data: JSON.stringify(data),
            dataType: 'json',
            contentType: "application/json",
            url: "https://lotto.fossil-cloud.net/lottoadvise",
            beforeSend: function() {
                $(".loading-overlay").removeClass("hidden");
            },
            success: function(resp) {
                console.log(resp);
                showAdvice(gameType, gameLabel, resp);
            },
            error: function(jqxhr, error, thrownError) {
                console.log(error)
            },
            complete: function() {
                $(".loading-overlay").addClass("hidden");
            }
        });
    }).on("click", ".random-numbers", function(e) {
        var gameType = $(this).data("game");
        var gameLabel = $(this).parents(".game-card").data("gamename");

        $.ajax({
            type: "GET",
            url: "https://lotto.fossil-cloud.net/lotto-randomizer?input=" + gameType,
            beforeSend: function() {
                $(".loading-overlay").removeClass("hidden");
            },
            success: function(resp) {
                console.log(resp);
                $(".mdl-card").hide();
                showRandomCombination(gameType, gameLabel, resp);
            },
            error: function(jqxhr, error, thrownError) {
                console.log(error)
            },
            complete: function() {
                $(".loading-overlay").addClass("hidden");
            }
        });
    })

});




