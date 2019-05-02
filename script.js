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
