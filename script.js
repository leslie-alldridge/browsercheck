// const caniuse = require("caniuse-api");

// caniuse.setBrowserScope("> 5%, last 3 versions");

// const browser = caniuse.getBrowserScope();
// const stable = caniuse.getLatestStableBrowsers();
// const usage = caniuse.getSupport("border-radius");
// console.log(stable);
// console.log(browser);
// console.log(usage);

// const ae = caniuse.getSupport("border-radius");
// const aee = caniuse.isSupported("border-radius", "ie 8, ie 9");
// caniuse.setBrowserScope("> 5%, last 1 version");
// const aeeee = caniuse.getSupport("border-radius");

// console.log(ae);
// console.log(aee);
// console.log(aeee);
// console.log(aeeee);
const browserslist = require("browserslist");
const query = "last 2 versions" || "last 2 versions";
bl = browserslist(query);
console.log(bl);

var request = new XMLHttpRequest();

request.open("GET", "https://browsercheck.xero.com/", true);
request.onload = function() {
  // Begin accessing JSON data here
  var data = JSON.parse(this.response);

  if (request.status >= 200 && request.status < 400) {
    console.log(data.ua.browser);
    const major = data.ua.browser.major.toLowerCase();
    const name = data.ua.browser.name.toLowerCase();
    console.log(name, major);
  } else {
    console.log("error");
  }
};

request.send();
