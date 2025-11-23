(async () => {
    const Query = '[data-testid="User-Name"] [tabindex="-1"]:not(:has([handled])) span';
    const Lifetime = 1000 * 60 * 60 * 12; // 12 hours, I don't know how often X updates their accuracy

    const Bearer = await GetFromBackground("Bearer");
    const CSRF = await GetFromBackground("CSRF");

    const Countries = await CreateStorageProxy("X_Countries");
    const Rates = await CreateStorageProxy("X_Rates");

    Delegate("mouseover", Query, async (e) => {
        if (GetRates().Amount === 0) return;

        const handle = e.innerHTML.substring(1);
        
        await GetCountryHTML(handle, true); // actually fetch data
        await UpdateAll();
    });

    // being very lazy for now
    new MutationObserver(() => UpdateAll()).observe(document.body, {childList: true, subtree: true});

    document.body.insertAdjacentHTML('beforebegin', '<div id="x-country-counter" style="position: fixed; border-radius: 6px; font-size: 12px; pointer-events: none; font-weight: bold; background: #222; padding: 10px; top: 16px; left: 16px;"></div>')
    const Counter = document.querySelector('#x-country-counter');
    setInterval(() => {
        const rates = GetRates();
        Counter.style.display = rates.Amount <= 10 ? 'block' : 'none';
        Counter.innerHTML = `Country Reveal<br/>Remaining: ${rates.Amount}<br/>Resets in: ${Math.floor((rates.Time - Date.now()) / (1000))} seconds`;
    }, 1000);
    
    // a very lazy approach since we're querying the entire dom all the time.
    // but do we even care? this means we don't have to handle a bunch of edge cases and syncing and refreshing stuff
    async function UpdateAll()
    {
        for(const entry of document.querySelectorAll(Query))
        {
            const handle = entry.innerHTML.substring(1);
            const result = await GetCountryHTML(handle,false);
            
            if(entry.matches('[handled]')) return; // weird edge case
            
            if(result)
            {
                entry.setAttribute('handled', 'handled');
                entry.innerHTML += result;
            }
        }    
    }

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
            "headers": { "accept": "*/*", "authorization": Bearer, "x-csrf-token": CSRF }
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

    async function VerifyHandle(handle) {
        let country = Countries[handle];
        
        if (!country || Date.now() - country.CacheDate > Lifetime) {
            const info = await GetInfo(handle);
            if (!info) return;

            Rates.Remaining = info.Remaining;
            Rates.ResetEpoch = info.ResetEpoch;

            Countries[handle] = {Country: info.Country, Accurate: info.Accurate, CacheDate: Date.now()};
        }
    }
    
    async function GetCountryHTML(handle, fetch)
    {
        if(fetch) await VerifyHandle(handle);
        
        const country = Countries[handle];
        if(!country) return null;

        const color = country.Accurate ? "#1a8cd8" : "#602c2c";
        return ` <span style="color: ${color}">${country.Country}</span>`;
    }
})();