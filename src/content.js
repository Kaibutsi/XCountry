(async () => {
    const Query = 'a[role="link"][tabindex="-1"]:not(:has([handled])) span';

    const Bearer = await GetFromBackground("Bearer");
    const CSRF = await GetFromBackground("CSRF");

    const Countries = await CreateStorageProxy("X_Countries");
    const Rates = await CreateStorageProxy("X_Rates");

    Delegate("mouseover", Query, async (e) => {
        if(GetRates().Amount === 0) return;
        
        e.setAttribute("handled", "true");
        const result = await HandleHover(e.innerHTML.substring(1));
        e.innerHTML += result;
    });
    
    
    
    function Delegate(type, query, callback) {
        document.body.addEventListener(type, function (event) {
            const target = event.target.closest(query);
            if (target) callback(target, event);
        });
    }

    function CreateStorageProxy(key) {
        return new Promise(resolve => {
            chrome.storage.local.get([key], entry => {

                let obj = entry[key] || {};
                let task = null;

                function Update() {
                    task = setTimeout(() => {
                        task = null;
                        chrome.storage.local.set({[key]: obj})
                    }, 100);
                }

                const result = new Proxy(obj, {
                    get(target, p, receiver) {
                        if (p === "Reset") return () => {
                            obj = {};
                            Update();
                        };

                        return Reflect.get(...arguments);
                    },
                    set(target, p, newValue, receiver) {
                        if (task == null && (target[p] === null || JSON.stringify(target[p]) !== JSON.stringify(newValue)))
                            Update();

                        return Reflect.set(...arguments);
                    }
                })

                resolve(result);
            })
        })
    }

    function GetFromBackground(type) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({type}, (response) => resolve(response));
        });
    }

    function GetRates() {
        if (!Rates.ResetEpoch || Rates.ResetEpoch * 1000 < Date.now())
            return {Amount: 50, Time: null}

        return {Amount: Rates.Remaining, Time: Rates.ResetEpoch * 1000}
    }
    
    async function GetInfo(target) {
        const result = await fetch(`https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery?variables=%7B%22screenName%22%3A%22${target}%22%7D`, {
            "headers": {
                "accept": "*/*",
                "accept-language": "en-GB,en;q=0.6",
                "authorization": Bearer,
                "content-type": "application/json",
                "priority": "u=1, i",
                "sec-ch-ua": "\"Chromium\";v=\"142\", \"Brave\";v=\"142\", \"Not_A Brand\";v=\"99\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "sec-gpc": "1",
                "x-csrf-token": CSRF,
                "x-twitter-active-user": "yes",
                "x-twitter-auth-type": "OAuth2Session",
                "x-twitter-client-language": "en"
            },
            "referrer": `https://x.com/${target}/about`,
            "body": null,
            "method": "GET",
            "mode": "cors",
            "credentials": "include"
        });

        try {
            const remaining = parseInt(result.headers.get("x-rate-limit-remaining"));
            const reset = parseInt(result.headers.get("x-rate-limit-reset"));

            const json = await result.json();
            const info = json.data.user_result_by_screen_name.result.about_profile;
            
            return {
                Country: info.account_based_in,
                Accurate: info.location_accurate,
                Remaining: remaining,
                ResetEpoch: reset
            }
        } catch (e) {
            console.log(e);
        }

        return null;
    }

    async function HandleHover(target) {
        if (!Countries[target]) {
            const info = await GetInfo(target);
            if (!info) return;

            Rates.Remaining = info.Remaining;
            Rates.ResetEpoch = info.ResetEpoch;

            Countries[target] = {Country: info.Country, Accurate: info.Accurate};
        }

        const country = Countries[target];
        
        const color = country.Accurate ? "#771b0c" : "#04b145";
        return ` <span style="color: ${color}">${country.Country}</span>`;
    }
})();

