// ==UserScript==
// @name         Google Review -> CSV Scraper
// @namespace    http://tampermonkey.net/
// @version      2025-11-09
// @description  Title is pretty succint
// @author       downgraide
// @match        https://www.google.com/maps/place/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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

    }, 2000);

    async function parsePage() {
        document.getElementById("gm-parser-box").innerHTML = "<div style='font-weight: bold'>Scraping...</div>"
        setTimeout(() => document.getElementById("gm-parser-box").remove(), 1500);

        // Step 2: Find the relevant query parameter
        const regex_str = /!1s(0x[^!]*)/
        const code = regex_str.exec(document.URL)[1]

        const count = 20; // Max is in fact 20.

        let continuation_code = "" // Be sure to convert from \u codes to % or whatever
        const exec_url = (() => `https://www.google.com/maps/rpc/listugcposts?authuser=0&hl=en&gl=us&pb=!1m6!1s${code}!6m4!4m1!1e1!4m1!1e3!2m2!1i${count}!2s${continuation_code}!5m2!1sfQoQaduhDvbmkPIP1aavuAk!7e81!8m9!2b1!3b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!11m4!1e3!2e1!6m1!1i2!13m1!1e1`);

        let total_fetched = 0

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

        function convertToUsableJSON(review) {
            try {
                // Data[2][i][0][1][4][5][0] is the name
                const name = review[0][1][4][5][0]
                // Data[2][i][0][2][0] is the rating
                const rating = review[0][2][0];
                // Data[2][i][0][2][15][0][0] description
                if (review[0][2].length == 1) {
                    return {name, rating, description: ""};
                }

                const description = review[0][2][15][0][0];
                return {name, rating, description};

            }catch (err) {
                console.log("error with", err, review);
                return {review};
            }

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

        const data = await repeatRequests();
        const uncleanReviews = data.flatMap(x => x[2]);
        console.log(uncleanReviews);

        // Step 4: Parse the incoming data
        const reviews = uncleanReviews.map((review) => convertToUsableJSON(review));
        console.log(reviews);

        // Step 5: Create a CSV blob
        // Step 6: Import the data and download
        const name = document.URL.split("/")[5].replaceAll("+", "-");
        console.log(name)
        jsonToCsv(reviews, `${name}.csv`);

    }
})();
