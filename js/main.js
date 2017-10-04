if (('serviceWorker' in navigator) && ('PushManager' in window)) {
    console.log('Service Worker is supported');

    var restBaseUrl = "https://teamcast-rest.herokuapp.com/rest/";
    var teamcastIDB,
        openDBRequest,
        cachedNotificationDeferred,
        cachedNotificationListDeferred;

    $(".teamcast-pwa.mdl-layout").removeClass("invisible");
    $(document).ready(function() {
        var controller = navigator.serviceWorker.controller;

        if (controller) {
            controller.postMessage("clientloaded");
        }
    });

    openDBRequest = indexedDB.open("teamcastIDB", 1);
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
        teamcastIDB = e.target.result;
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
        var deleteDataCache = function() {
            return caches.keys()
                .then(function(allCaches) {
                    allCaches.map(function(cacheName) {
                        if (cacheName == "teamcast-data-cache" || cacheName == "teamcast-account-cache") {
                            return caches.delete(cacheName);
                        }
                    });
                })
        }

        var deleteNotificationStore = function() {
            teamcastIDB.transaction("notifications", "readwrite")
                .objectStore("notifications")
                .clear()
                .onsuccess = function(event) {
                console.log("Successfully cleared notifications IndexedDB store.");
            }
        };

        var getCachedNotificationList = function() {
            cachedNotificationListDeferred = new $.Deferred();
            teamcastIDB.transaction("notifications")
                .objectStore("notifications")
                .getAll()
                .onsuccess = function(event) {
                cachedNotificationListDeferred.resolve(event.target.result);
            }
        };

        var getCachedNotification = function(announcementId) {
            cachedNotificationDeferred = new $.Deferred();
            teamcastIDB.transaction("notifications")
                .objectStore("notifications")
                .get(announcementId)
                .onsuccess = function(event) {
                cachedNotificationDeferred.resolve(event.target.result);
            }
        }

        var updateNotificationProperty = function(announcementId, propertyName, propertyVal) {
            var objectStore = teamcastIDB.transaction("notifications", "readwrite").objectStore("notifications");
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
            var notificationsTransaction = teamcastIDB.transaction("notifications", "readwrite");
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

        serviceWorkerRegistration.pushManager.getSubscription()
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

        navigator.serviceWorker.addEventListener('message', function(event) {
            if (event && event.data) {
                var messageObj = event.data.body;
                var profileObj = JSON.parse(localStorage.getItem("profile"));
                var cacheDeferred = new $.Deferred();

                cacheNotification(messageObj, cacheDeferred);

                $.when(cacheDeferred).done(function(val) {
                    $.ajax({
                        type: 'PUT',
                        url: restBaseUrl + "announcements/" + messageObj.announcementId + "/seen/" + profileObj.accountId,
                        success: function() {
                            updateNotificationProperty(messageObj.announcementId, "seen", 1);
                        },
                        error: function(jqxhr, error, thrownError) {
                            console.log("Error setting announcement ID " + messageObj.announcementId + " to SEEN.");
                        }
                    });
                })

                $(".mdl-card").hide();
                $(".notification-card").removeClass("has-media");
                $(".mdl-card__title-text", ".notification-card").text(messageObj.heading);
                $(".mdl-card__title", ".notification-card").css({
                    "background-image": "none"
                });

                console.log($(".mdl-card__title", ".notification-card").attr("style"));

                $(".mdl-card__supporting-text", ".notification-card")
                    .find("p").text(messageObj.content);
                $(".options-container", ".notification-card").empty();

                if (messageObj.options && messageObj.options.length && messageObj.options[0] !== null) {
                    var optLen = messageObj.options.length;
                    for (x = 0; x < optLen; x++) {
                        var data = {
                            "id": messageObj.options[x],
                            "name": messageObj.options[x].toUpperCase()
                        }
                        var template = $("#options-template").html();
                        var optMarkup = Mustache.to_html(template, data);
                        var newRadio = $(optMarkup)[0];
                        componentHandler.upgradeElement(newRadio);

                        $(".options-container", ".notification-card").append(newRadio);
                    }
                    $("#respond-btn").data("announcementid", messageObj.announcementId);
                    $("#respond-btn").prop("disabled", true);
                    $(".mdl-card__actions", ".notification-card").show();
                } else {
                    $(".mdl-card__actions", ".notification-card").hide();
                }

                if (messageObj.imgId != "") {
                    console.log("imgId = ", messageObj.imgId);
                    var imgUrl = restBaseUrl + "images/" + messageObj.imgId;

                    $(".notification-card").addClass("has-media")
                        .find(".mdl-card__title").css({
                            'background-image': 'url(' + imgUrl + ')'
                        });

                    console.log($(".mdl-card__title", ".notification-card").attr("style"));
                }

                $(".notification-card").show();

                if ($(".mdl-layout__drawer.is-visible").length) {
                    var layout = document.querySelector('.mdl-layout');
                    layout.MaterialLayout.toggleDrawer();
                }
                if (!$(".inbox-back-btn").hasClass("hidden")) {
                    $(".inbox-back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
                }
            }
        });

        $("input[type='text']", "#subscription-form").on("keyup change", function(e) {
            var filledUp = true;

            $("#subscribe-btn").prop("disabled", true);
            $("input[type='text']", "#subscription-form").each(function() {
                if (!$.trim($(this).val()).length) filledUp = false;
            })

            if (filledUp) $("#subscribe-btn").prop("disabled", false);
        });

        $('#subscribe-btn').on('click', function(e) {
            e.preventDefault();

            if (!$(this).is(":disabled")) {
                $(".loading-overlay").removeClass("hidden");
                serviceWorkerRegistration.pushManager.subscribe({
                    userVisibleOnly: true
                }).then(function(subscription) {
                    var subscriptionObj = JSON.parse(JSON.stringify(subscription));
                    var profileObj = {
                        "firstName": $("#firstname").val().toUpperCase(),
                        "lastName": $("#lastname").val().toUpperCase(),
                        "registrationId": subscriptionObj.endpoint.split("https://android.googleapis.com/gcm/send/")[1],
                        "publicKey": subscriptionObj["keys"]["p256dh"],
                        "auth": subscriptionObj["keys"]["auth"]
                    }

                    $.ajax({
                        type: 'POST',
                        data: JSON.stringify(profileObj),
                        contentType: "application/json",
                        url: restBaseUrl + "accounts",
                        success: function(resp) {
                            profileObj.accountId = resp.id;
                            localStorage.setItem("profile", JSON.stringify(profileObj));

                            caches.open("teamcast-account-cache")
                                .then(function(cache) {
                                    console.log("CACHENAME: ", "teamcast-account-cache");
                                    cache.put(new URL("https://teamcast-rest.herokuapp.com/rest/accounts"), new Response(resp.id));
                                });

                            //$("#subscription-form")[0].reset();
                            componentHandler.upgradeElement($("#firstname")[0]);
                            componentHandler.upgradeElement($("#lastname")[0]);

                            $(".mdl-card").hide();
                            $(".employee-name").html(profileObj.firstName.toLowerCase() + " " + profileObj.lastName.toLowerCase());
                            $(".unsubscribe-card, #unsubscribe-btn, #profile-btn, #inbox-btn").show();
                            $("#profile-accountid").val(profileObj.accountId);
                            $("#profile-firstname").val(profileObj.firstName);
                            $("#profile-lastname").val(profileObj.lastName);
                            $(".loading-overlay").addClass("hidden");
                        },
                        error: function(jqxhr, error, thrownError) {
                            console.log(jqxhr);
                            console.log(error);
                            console.log(thrownError);
                        }
                    });
                })
                    .catch(function(err) {
                        console.log('Error during getSubscription()', err);
                        $(".loading-overlay").addClass("hidden");
                    });
            }
        });

        $('#unsubscribe-btn').on('click', function(e) {
            e.preventDefault();

            //if (confirm("Are you sure you want to unsubscribe from TeamCast?")) {
                var layout = document.querySelector('.mdl-layout');
                layout.MaterialLayout.toggleDrawer();

                $(".loading-overlay").removeClass("hidden");

                serviceWorkerRegistration.pushManager.getSubscription()
                    .then(function(subscription) {
                        subscription.unsubscribe().then(function(successful) {
                            var profileObj = JSON.parse(localStorage.getItem("profile"));

                            $("#profile-form")[0].reset();

                            $.ajax({
                                type: 'DELETE',
                                data: JSON.stringify(profileObj),
                                url: restBaseUrl + "accounts/" + profileObj.accountId,
                                complete: function() {
                                    $(".mdl-card, #unsubscribe-btn, #profile-btn, #inbox-btn").hide();
                                    $(".subscription-card").show();
                                    //$("#subscribe-btn").prop("disabled", true)
                                    $(".loading-overlay").addClass("hidden");
                                },
                                error: function(jqxhr, error, thrownError) {
                                    console.log(jqxhr);
                                    console.log(error);
                                    console.log(thrownError);
                                }
                            });

                            localStorage.removeItem("profile");
                            deleteNotificationStore();
                            deleteDataCache();

                        }).catch(function(e) {
                            // Unsubscribe failed
                            $(".loading-overlay").addClass("hidden");
                        })
                    });
            //}
        });

        $('#notif-card-close-btn').on('click', function(e) {
            e.preventDefault();

            $(".notification-card").hide();
            $(".mdl-card__supporting-text", ".notification-card")
                .find("p").text("");
            $(".options-container", ".notification-card").empty();
            $(".unsubscribe-card").show();
        });

        $(".card-close-btn:not([id])").on("click", function(e) {
            e.preventDefault();

            var $lastShownCard = (localStorage.getItem("profile")) ? $(".unsubscribe-card") : $(".subscription-card");

            $(this).parent().hide();
            $lastShownCard.show();
        });

        $("body").on("click", ".mdl-radio", function() {
            $("#respond-btn").prop("disabled", false);
        });

        $("#respond-btn").on("click", function(e) {
            if (!$(this).is(":disabled")) {
                var $this = $(this);
                var profileObj = JSON.parse(localStorage.getItem("profile"));
                var responseObj = {
                    "option": $("input[type='radio']", ".mdl-radio.is-checked").val()
                }

                $.ajax({
                    type: 'POST',
                    data: JSON.stringify(responseObj),
                    contentType: "application/json",
                    url: restBaseUrl + "announcements/" + $this.data("announcementid") + "/acknowledge/" + profileObj.accountId,
                    beforeSend: function() {
                        $(".loading-overlay").removeClass("hidden");
                    },
                    success: function(resp) {
                        updateNotificationProperty($this.data("announcementid"), "response", responseObj.option);
                        $(".notification-card").hide();
                        $(".mdl-card__supporting-text", ".notification-card")
                            .find("p").text("");
                        $(".options-container", ".notification-card").empty();
                        $(".unsubscribe-card").show();
                    },
                    error: function(jqxhr, error, thrownError) {
                        console.log(jqxhr);
                        console.log(error);
                        console.log(thrownError);
                    },
                    complete: function() {
                        $(".loading-overlay").addClass("hidden");
                    }
                });
            }
        });

        $("#about-btn").on("click", function(e) {
            e.preventDefault();

            var layout = document.querySelector('.mdl-layout');

            $(".mdl-card").hide();
            $(".about-card").show();

            layout.MaterialLayout.toggleDrawer();
        })

        $("#profile-btn").on("click", function(e) {
            e.preventDefault();

            var layout = document.querySelector('.mdl-layout');

            $(".mdl-card").hide();
            $(".profile-card").show();

            layout.MaterialLayout.toggleDrawer();
        })

        $("#inbox-btn").on("click", function(e) {
            e.preventDefault();

            getCachedNotificationList();

            $.when(cachedNotificationListDeferred).done(function(val) {
                console.log("CACHED NOTIFICATIONS: ", val);

                var template = $("#notif-list-template").html();
                var layout = document.querySelector('.mdl-layout');
                var listData = _.sortBy(val, "createTime").reverse();

                $(".mdl-list", ".inbox-card").empty();

                if (!listData.length) {
                    $(".mdl-list", ".inbox-card").append($("#notif-list-empty-template").html());;
                } else {
                    for (x = 0; x < listData.length; x++) {
                        var displayDate = new Date(listData[x]["createTime"]);

                        listData[x]["createTime"] = displayDate.toLocaleString();
                        var listItemMarkup = Mustache.to_html(template, listData[x]);

                        $(".mdl-list", ".inbox-card").append(listItemMarkup);
                    }
                }

                $(".mdl-card").hide();
                $(".inbox-back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
                $(".inbox-card").show();

                layout.MaterialLayout.toggleDrawer();
            })
        })

        $(".inbox-back-btn").on("click", function(e) {
            $(".mdl-card").hide();
            $(".unsubscribe-card").show();
            $(".inbox-back-btn, .mdl-layout__drawer-button, .mdl-layout-title").toggleClass("hidden");
        })

        $(".inbox-card").on("click", "button", function(e) {
            var $item = $(e.currentTarget);

            getCachedNotification(JSON.stringify($item.data("announcementid")));

            $.when(cachedNotificationDeferred).done(function(val) {
                var cachedNotifData = val;

                $(".inbox-card").hide();
                $(".cached-notification-card").removeClass("has-media");
                $(".mdl-card__title-text", ".cached-notification-card").text(cachedNotifData.heading);
                $(".mdl-card__title", ".cached-notification-card").css({
                    "background-image": "none"
                });

                $(".mdl-card__supporting-text", ".cached-notification-card")
                    .find("p").text(cachedNotifData.content);
                $(".options-container", ".cached-notification-card").empty();

                if (cachedNotifData.options && cachedNotifData.options.length && cachedNotifData.options[0] !== null) {
                    var optLen = cachedNotifData.options.length;
                    for (x = 0; x < optLen; x++) {
                        var data = {
                            "id": cachedNotifData.options[x],
                            "name": cachedNotifData.options[x].toUpperCase()
                        }
                        var template = $("#options-template").html();
                        var optMarkup = Mustache.to_html(template, data);
                        var newRadio = $(optMarkup)[0];
                        componentHandler.upgradeElement(newRadio);

                        if (cachedNotifData.options[x] == cachedNotifData.response) {
                            $(newRadio).addClass("is-checked");
                        }

                        $("input", $(newRadio)).attr("disabled","disabled");

                        $(".options-container", ".cached-notification-card").append(newRadio);
                    }
                    //$("#respond-btn").data("announcementid", cachedNotifData.announcementId);
                    //$("#respond-btn").prop("disabled", true);
                    $(".mdl-card__actions", ".cached-notification-card").show();
                } else {
                    $(".mdl-card__actions", ".cached-notification-card").hide();
                }

                if (cachedNotifData.imgId != "") {
                    var imgUrl = restBaseUrl + "images/" + cachedNotifData.imgId;

                    $(".cached-notification-card").addClass("has-media")
                        .find(".mdl-card__title").css({
                            'background-image': 'url(' + imgUrl + ')'
                        });
                }

                $(".cached-notification-card").show();
            })
        });

        $('#cached-notif-card-close-btn').on('click', function(e) {
            e.preventDefault();

            $(".cached-notification-card").hide();
            $(".mdl-card__supporting-text", ".cached-notification-card")
                .find("p").text("");
            $(".options-container", ".cached-notification-card").empty();
            $(".inbox-card").show();
        });
    });
} else {
    $("header, footer").remove();
    $(".loading-overlay").addClass("hidden");
    $(".not-supported-card").show();
    $(".teamcast-pwa.mdl-layout").removeClass("invisible");
}