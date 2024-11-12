console.log("Content script loaded");

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "extractHTML") {
        sendResponse({html: document.documentElement.outerHTML});
    }
});