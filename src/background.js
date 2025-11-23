let bearer = null;

function ResolveBearer(response) {
    if (bearer) response(bearer);
    else setTimeout(() => ResolveBearer(response), 100);
}

chrome.runtime.onMessage.addListener((message, _, response) => {
    if (message?.type === "Bearer")
        ResolveBearer(response)

    if (message?.type === "CSRF")
        chrome.cookies.get({url: "https://x.com", name: "ct0"}, (cookie) => {
            response(cookie.value);
        });
    
    return true;
});

chrome.webRequest.onBeforeSendHeaders.addListener(
    details => {
        const auth = details.requestHeaders.find(h => h.value?.startsWith("Bearer "));
        if (auth != null) bearer = auth.value;
    }, {urls: ["https://x.com/*"]}, ["requestHeaders"]
);