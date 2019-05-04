// const browserslist = require("browserslist");
// const query = "last 2 versions" || "last 2 versions";
// bl = browserslist(query);
// console.log(bl);

// var request = new XMLHttpRequest();

// request.open("GET", "https://browsercheck.xero.com/", true);
// request.onload = function() {
//   // Begin accessing JSON data here
//   var data = JSON.parse(this.response);

//   if (request.status >= 200 && request.status < 400) {
//     console.log(data.ua.browser);
//     const major = data.ua.browser.major.toLowerCase();
//     const name = data.ua.browser.name.toLowerCase();
//     console.log(name, major);
//     const searchString = name + " " + major;
//     console.log(searchString);
//     var supported = bl.find(function(item) {
//       return item == searchString;
//     });
//     console.log(supported);
//     if (supported != undefined) {
//       console.log("*** your browser is supported ***");
//     } else {
//       console.log("*** your browser in unsuported you pleb***");
//     }
//   } else {
//     console.log("error");
//   }
// };

// request.send();

const data = [
  ["chrome", "72"],
  ["chrome", "71"],
  ["chrome", "70"],
  ["edge", "18"],
  ["edge", "17"]
]
let supportObj = {
  "chrome": "",
  "edge": "",
  "firefox": "",
  "ie": "",
  "safari": ""
}

function sortData(name){
  supportObj[name] = data.filter(function(item) {
    return item[0] == name;
  });
}

Object.keys(supportObj).forEach(function(key) {
  sortData(key)
});

// sortData("chrome")
// console.log(Object.keys(supportObj));

// console.log("%%%");

console.log(supportObj);




