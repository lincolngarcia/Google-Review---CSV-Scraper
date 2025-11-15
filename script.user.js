// ==UserScript==
// @name         Google Review -> CSV Scraper
// @namespace    http://tampermonkey.net/
// @version      2025-11-09
// @description  Title is pretty succint
// @author       downgraide
// @match        https://www.google.com/maps*
// @match        https://www.maps.google.com*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.navigation.addEventListener("navigate", (event) => {
        // Check nav url
        if (event.currentTarget.currentEntry.url.includes("https://www.google.com/maps/place")) loadParser();
    });

    function loadParser() {
        if (!document.querySelector("#gm-parser-box")) {

            // Step 1: recongize the page is loaded & request permission
            console.log("Tampermonkey engaged. Grab your wrench.");

            const box = document.createElement('div');

            box.id = 'gm-parser-box';
            box.style.position = 'fixed';
            box.style.top = '10px';
            box.style.right = '10px';
            box.style.zIndex = '99999';
            box.style.background = 'rgba(255, 255, 255, 0.9)';
            box.style.border = '1px solid #ccc';
            box.style.borderRadius = '6px';
            box.style.padding = '10px';
            box.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
            box.style.fontFamily = 'sans-serif';
            box.style.fontSize = '13px';

            // Add content
            box.innerHTML = `
        <div style="margin-bottom:6px; font-weight:bold">Review Scraper</div>
        <button id="gm-close-btn" style="
            position: absolute;
            top: 10px;
            right: 10px;
            cursor: pointer;
        ">x</button>
        <div id='scraper_msg' style='font-weight: bold; display: none;'>Scraping...</div>
        <button id="gm-parse-btn" style="
            background:#4285f4;
            color:white;
            border:none;
            border-radius:4px;
            padding:6px 10px;
            cursor:pointer;
        ">Parse This Page</button>
    `;

            // Append to page
            setTimeout(() => {
                document.body.appendChild(box)

                // Button click handler
                document.getElementById('gm-parse-btn').addEventListener('click', () => {
                    try {
                        parsePage()
                    }catch(err){
                        alert(err.message)
                    }
                });

                // Button click handler
                document.getElementById('gm-close-btn').addEventListener('click', () => {
                    document.getElementById("gm-parser-box").remove();
                });

                console.log("Tampermonkey: Review Scraper box injected. ✅");

            }, 500);

        }
    }

    async function parsePage() {
        document.getElementById("gm-close-btn").style.display = "none"
        document.getElementById("gm-parse-btn").style.display = "none"
        document.getElementById("scraper_msg").style.display = "block"
        setTimeout(() => {
            document.getElementById("gm-parse-btn").style.display = "block"
            document.getElementById("gm-close-btn").style.display = "block"
            document.getElementById("scraper_msg").style.display = "none";
        }, 1500);

        // Step 2: Find the relevant query parameter
        const regex_str = /!1s(0x[^!]*)/
        const code = regex_str.exec(document.URL)[1]

        const count = 20; // Max is in fact 20.

        let continuation_code = "" // Be sure to convert from \u codes to % or whatever
        const exec_url = (() => `https://www.google.com/maps/rpc/listugcposts?authuser=0&hl=en&gl=us&pb=!1m6!1s${code}!6m4!4m1!1e1!4m1!1e3!2m2!1i${count}!2s${continuation_code}!5m2!1sfQoQaduhDvbmkPIP1aavuAk!7e81!8m9!2b1!3b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!11m4!1e3!2e1!6m1!1i2!13m1!1e1`);

        let total_fetched = 0

        const privateKey = "3TNMmf8oCYGrc7DiX3jRaesn2HXBgzYZePcOGaD3CrVSeoIl"

        // Step 3: Make the request to listugcposts with the query
        async function executeNextRequest() {
            return await fetch(exec_url())
                .then(data => data.text())
                .then(data => data.slice(5))
                .then(data => JSON.parse(data))
                .then(data => {
                if (!data) return [false, false]
                return [data[1], data]
            })

        }

        async function repeatRequests() {
            const [cont_code, data] = await executeNextRequest();
            if (data.length == 0) {
                console.warn("exiting due to a denied request")
                return [];
            }

            continuation_code = cont_code
            total_fetched += data[2].length
            console.log(`Fetched ${data[2].length}; total fetched ${total_fetched}; ${cont_code ? "continuing with code " + cont_code : "exiting..."}\nReturned`, data);

            if (cont_code) return [data, ...await repeatRequests()];
            return [data]
        }

        async function findBusinessID() {
            let businessName = decodeURIComponent(window.location.pathname.split("/place/")[1].split("/")[0]).replaceAll("+", " " );

            while (true) {
                if (businessName == null) window.confirm("give up?") ? businessName = null : businessName = window.prompt("What name should we look in the database for?")
                if (businessName == null) return null
                if (businessName == "") continue;

                const initConfirm = window.confirm(`We will search the database for: ${businessName}`);

                if (initConfirm) {
                    const query = await fetch(`https://ourtownmot.com/_functions/busID?q=${businessName}`)
                    .then(data => data.json())
                    console.log(query);
                    const items = query.items

                    if (items.length === 0) {
                        businessName = window.prompt("We couldn't find that in the database. What name should we look for?");
                    }else if (items.length === 1) {
                        const business = items[0]
                        const confirmChoice = window.confirm(`We found a business with the name ${business.businessName}, is this correct?`);
                        if (confirmChoice) return business._id
                        else businessName = window.prompt("What name should we look for then?")
                    }else {
                        const businessNames = [...items.map(x => ({"Business Name": x.businessName, "Category": x.categoryName, _id: x._id})), {"Business Name": "None of these", "Category": ""}];
                        const confirmChoice = await choiceAlert("please select a business from the list", businessNames)

                        if (confirmChoice["Business Name"] !== "None of these") return confirmChoice._id
                        else businessName = window.prompt("What name should we look for then?")

                    }
                }else{
                    businessName = window.prompt("What name should we look in the database for?")
                }
            }
        }

        async function postReviews(businessID, reviews) {
            return await fetch("https://ourtownmot.com/_functions/reviews", {
                method: "POST",
                body: JSON.stringify({
                    privateKey,
                    businessID,
                    reviews
                })
            })
                .then(data => data.json())
                .then(data => data.err ? false: data);
        }

        function convertToUsableJSON(review) {
            try {
                console.log("attempting to convert", review)
                // Data[2][i][0][1][4][5][0] is the name
                const name = review[0][1][4][5][0]
                // Data[2][i][0][2][0] is the rating
                const rating = review[0][2][0][0];
                // Data[2][i][0][2][15][0][0] description
                if (review[0][2].length == 1) {
                    return {"Full Name": (name ? name : "Anonymus"), Email: "google_email", rating, description:"", Business: "Untitled"}
                }

                const description = review[0][2][15][0][0];
                return {"Full Name": (name ? name : "Anonymus"), Email: "google_email", rating, description, Business: "Untitled"};

            }catch (err) {
                alert("There was an error. tell lincoln");
                console.log("error with", err, review);
                return {review};
            }

        }


        const [businessID, data] = await Promise.all([
            findBusinessID(),
            repeatRequests()
        ]);

        const uncleanReviews = data.flatMap(x => x[2]);
        console.log(uncleanReviews);

        // Step 4: Parse the incoming data
        const reviews = uncleanReviews.map((review) => convertToUsableJSON(review));
        console.log(reviews);

        // Post the data
        const upload = await postReviews(businessID, reviews);
        console.log(upload)
        if (upload == false) alert("something went wrong, please contact lincoln");
        else alert(`congraguations. ${reviews.length} reviews uploaded`);
        // Don't do anytning here
        // Step 5: Create a CSV blob
        // Step 6: Import the data and download
        //const name = document.URL.split("/")[5].replaceAll("+", "-");
        //console.log(name)
        //jsonToCsv(reviews, `${name}.csv`);
    }

    function jsonToCsv(jsonArray, fileName = 'output.csv') {
        if (!jsonArray || !jsonArray.length) {
            throw new Error("The JSON array is empty.");
        }

        // Get CSV headers from the keys of the first object
        const headers = Object.keys(jsonArray[0]);
        const csvRows = [];

        // Add the header row
        csvRows.push(headers.join(','));

        // Add the data rows
        for (const obj of jsonArray) {
            const values = headers.map(header => {
                const value = obj[header] !== undefined ? obj[header] : '';
                // Escape double quotes by doubling them and wrap in quotes if needed
                return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        }

        // Combine rows into a single CSV string
        const csvString = csvRows.join('\n');

        // Trigger file download in the browser
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    function choiceAlert(message, choices) {
        return new Promise(resolve => {
            // overlay
            const overlay = document.createElement("div");
            overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

            // modal
            const modal = document.createElement("div");
            modal.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 300px;
      text-align: center;
      box-shadow: 0 0 20px rgba(0,0,0,0.2);
    `;

            modal.innerHTML = `<p>${message}</p>`;

            // Buttons
            choices.forEach(choice => {
                const parent = document.createElement("div");
                const btn = document.createElement("button");
                parent.appendChild(btn);

                btn.innerHTML = `${choice["Business Name"]}<br /><span style="font-weight: 300">${choice.Category}</span>`;
                btn.style.margin = "6px";
                btn.style.padding = "2px";
                btn.style.border = "1px solid black";
                btn.style.cursor = "pointer";
                btn.onclick = () => {
                    document.body.removeChild(overlay);
                    resolve(choice);
                };
                modal.appendChild(parent);
            });

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }
})();
