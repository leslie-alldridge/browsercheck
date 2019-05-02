(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
var BrowserslistError = require('./error')

function noop () { }

module.exports = {
  loadQueries: function loadQueries () {
    throw new BrowserslistError(
      'Sharable configs are not supported in client-side build of Browserslist')
  },

  getStat: function getStat (opts) {
    return opts.stats
  },

  loadConfig: function loadConfig (opts) {
    if (opts.config) {
      throw new BrowserslistError(
        'Browserslist config are not supported in client-side build')
    }
  },

  loadCountry: function loadCountry () {
    throw new BrowserslistError(
      'Country statistics is not supported ' +
      'in client-side build of Browserslist')
  },

  currentNode: function currentNode (resolve, context) {
    return resolve(['maintained node versions'], context)[0]
  },

  parseConfig: noop,

  readConfig: noop,

  findConfig: noop,

  clearCaches: noop,

  oldDataWarning: noop
}

},{"./error":3}],3:[function(require,module,exports){
function BrowserslistError (message) {
  this.name = 'BrowserslistError'
  this.message = message
  this.browserslist = true
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, BrowserslistError)
  }
}

BrowserslistError.prototype = Error.prototype

module.exports = BrowserslistError

},{}],4:[function(require,module,exports){
var jsReleases = require('node-releases/data/processed/envs.json')
var agents = require('caniuse-lite/dist/unpacker/agents').agents
var jsEOL = require('node-releases/data/release-schedule/release-schedule.json')
var path = require('path')
var e2c = require('electron-to-chromium/versions')

var BrowserslistError = require('./error')
var env = require('./node') // Will load browser.js in webpack

var FLOAT_RANGE = /^\d+(\.\d+)?(-\d+(\.\d+)?)*$/
var YEAR = 365.259641 * 24 * 60 * 60 * 1000

// Enum values MUST be powers of 2, so combination are safe
/** @constant {number} */
var QUERY_OR = 1
/** @constant {number} */
var QUERY_AND = 2

function isVersionsMatch (versionA, versionB) {
  return (versionA + '.').indexOf(versionB + '.') === 0
}

function isEolReleased (name) {
  var version = name.slice(1)
  return jsReleases.some(function (i) {
    return isVersionsMatch(i.version, version)
  })
}

function normalize (versions) {
  return versions.filter(function (version) {
    return typeof version === 'string'
  })
}

function nameMapper (name) {
  return function mapName (version) {
    return name + ' ' + version
  }
}

function getMajor (version) {
  return parseInt(version.split('.')[0])
}

function getMajorVersions (released, number) {
  if (released.length === 0) return []
  var minimum = getMajor(released[released.length - 1]) - parseInt(number) + 1
  var selected = []
  for (var i = released.length - 1; i >= 0; i--) {
    if (minimum > getMajor(released[i])) break
    selected.unshift(released[i])
  }
  return selected
}

function uniq (array) {
  var filtered = []
  for (var i = 0; i < array.length; i++) {
    if (filtered.indexOf(array[i]) === -1) filtered.push(array[i])
  }
  return filtered
}

// Helpers

function fillUsage (result, name, data) {
  for (var i in data) {
    result[name + ' ' + i] = data[i]
  }
}

function generateFilter (sign, version) {
  version = parseFloat(version)
  if (sign === '>') {
    return function (v) {
      return parseFloat(v) > version
    }
  } else if (sign === '>=') {
    return function (v) {
      return parseFloat(v) >= version
    }
  } else if (sign === '<') {
    return function (v) {
      return parseFloat(v) < version
    }
  } else {
    return function (v) {
      return parseFloat(v) <= version
    }
  }
}

function generateSemverFilter (sign, version) {
  version = version.split('.').map(parseSimpleInt)
  version[1] = version[1] || 0
  version[2] = version[2] || 0
  if (sign === '>') {
    return function (v) {
      v = v.split('.').map(parseSimpleInt)
      return compareSemver(v, version) > 0
    }
  } else if (sign === '>=') {
    return function (v) {
      v = v.split('.').map(parseSimpleInt)
      return compareSemver(v, version) >= 0
    }
  } else if (sign === '<') {
    return function (v) {
      v = v.split('.').map(parseSimpleInt)
      return compareSemver(version, v) > 0
    }
  } else {
    return function (v) {
      v = v.split('.').map(parseSimpleInt)
      return compareSemver(version, v) >= 0
    }
  }
}

function parseSimpleInt (x) {
  return parseInt(x)
}

function compare (a, b) {
  if (a < b) return -1
  if (a > b) return +1
  return 0
}

function compareSemver (a, b) {
  return (
    compare(a[0], b[0]) ||
    compare(a[1], b[1]) ||
    compare(a[2], b[2])
  )
}

function normalizeVersion (data, version) {
  if (data.versions.indexOf(version) !== -1) {
    return version
  } else if (browserslist.versionAliases[data.name][version]) {
    return browserslist.versionAliases[data.name][version]
  } else if (data.versions.length === 1) {
    return data.versions[0]
  } else {
    return false
  }
}

function filterByYear (since) {
  since = since / 1000
  return Object.keys(agents).reduce(function (selected, name) {
    var data = byName(name)
    if (!data) return selected
    var versions = Object.keys(data.releaseDate).filter(function (v) {
      return data.releaseDate[v] >= since
    })
    return selected.concat(versions.map(nameMapper(data.name)))
  }, [])
}

function byName (name) {
  name = name.toLowerCase()
  name = browserslist.aliases[name] || name
  return browserslist.data[name]
}

function checkName (name) {
  var data = byName(name)
  if (!data) throw new BrowserslistError('Unknown browser ' + name)
  return data
}

function unknownQuery (query) {
  return new BrowserslistError(
    'Unknown browser query `' + query + '`. ' +
    'Maybe you are using old Browserslist or made typo in query.'
  )
}

/**
 * Resolves queries into a browser list.
 * @param {string|string[]} queries Queries to combine.
 * Either an array of queries or a long string of queries.
 * @param {object} [context] Optional arguments to
 * the select function in `queries`.
 * @returns {string[]} A list of browsers
 */
function resolve (queries, context) {
  if (Array.isArray(queries)) {
    queries = flatten(queries.map(parse))
  } else {
    queries = parse(queries)
  }

  return queries.reduce(function (result, query, index) {
    var selection = query.queryString

    var isExclude = selection.indexOf('not ') === 0
    if (isExclude) {
      if (index === 0) {
        throw new BrowserslistError(
          'Write any browsers query (for instance, `defaults`) ' +
          'before `' + selection + '`')
      }
      selection = selection.slice(4)
    }

    for (var i = 0; i < QUERIES.length; i++) {
      var type = QUERIES[i]
      var match = selection.match(type.regexp)
      if (match) {
        var args = [context].concat(match.slice(1))
        var array = type.select.apply(browserslist, args).map(function (j) {
          var parts = j.split(' ')
          if (parts[1] === '0') {
            return parts[0] + ' ' + byName(parts[0]).versions[0]
          } else {
            return j
          }
        })

        switch (query.type) {
          case QUERY_AND:
            if (isExclude) {
              return result.filter(function (j) {
                // remove result items that are in array
                // (the relative complement of array in result)
                return array.indexOf(j) === -1
              })
            } else {
              return result.filter(function (j) {
                // remove result items not in array
                // (intersect of result and array)
                return array.indexOf(j) !== -1
              })
            }
          case QUERY_OR:
          default:
            if (isExclude) {
              var filter = { }
              array.forEach(function (j) {
                filter[j] = true
              })
              return result.filter(function (j) {
                return !filter[j]
              })
            }
            // union of result and array
            return result.concat(array)
        }
      }
    }

    throw unknownQuery(selection)
  }, [])
}

/**
 * Return array of browsers by selection queries.
 *
 * @param {(string|string[])} [queries=browserslist.defaults] Browser queries.
 * @param {object} [opts] Options.
 * @param {string} [opts.path="."] Path to processed file.
 *                                 It will be used to find config files.
 * @param {string} [opts.env="production"] Processing environment.
 *                                         It will be used to take right
 *                                         queries from config file.
 * @param {string} [opts.config] Path to config file with queries.
 * @param {object} [opts.stats] Custom browser usage statistics
 *                              for "> 1% in my stats" query.
 * @param {boolean} [opts.ignoreUnknownVersions=false] Do not throw on unknown
 *                                                     version in direct query.
 * @param {boolean} [opts.dangerousExtend] Disable security checks
 *                                         for extend query.
 * @returns {string[]} Array with browser names in Can I Use.
 *
 * @example
 * browserslist('IE >= 10, IE 8') //=> ['ie 11', 'ie 10', 'ie 8']
 */
function browserslist (queries, opts) {
  if (typeof opts === 'undefined') opts = { }

  if (typeof opts.path === 'undefined') {
    opts.path = path.resolve ? path.resolve('.') : '.'
  }

  if (typeof queries === 'undefined' || queries === null) {
    var config = browserslist.loadConfig(opts)
    if (config) {
      queries = config
    } else {
      queries = browserslist.defaults
    }
  }

  if (!(typeof queries === 'string' || Array.isArray(queries))) {
    throw new BrowserslistError(
      'Browser queries must be an array or string. Got ' + typeof queries + '.')
  }

  var context = {
    ignoreUnknownVersions: opts.ignoreUnknownVersions,
    dangerousExtend: opts.dangerousExtend
  }

  env.oldDataWarning(browserslist.data)
  var stats = env.getStat(opts, browserslist.data)
  if (stats) {
    context.customUsage = { }
    for (var browser in stats) {
      fillUsage(context.customUsage, browser, stats[browser])
    }
  }

  var result = resolve(queries, context).sort(function (name1, name2) {
    name1 = name1.split(' ')
    name2 = name2.split(' ')
    if (name1[0] === name2[0]) {
      if (FLOAT_RANGE.test(name1[1]) && FLOAT_RANGE.test(name2[1])) {
        return parseFloat(name2[1]) - parseFloat(name1[1])
      } else {
        return compare(name2[1], name1[1])
      }
    } else {
      return compare(name1[0], name2[0])
    }
  })

  return uniq(result)
}

/**
 * @typedef {object} BrowserslistQuery
 * @property {number} type A type constant like QUERY_OR @see QUERY_OR.
 * @property {string} queryString A query like "not ie < 11".
 */

/**
 * Parse a browserslist string query
 * @param {string} queries One or more queries as a string
 * @returns {BrowserslistQuery[]} An array of BrowserslistQuery
 */
function parse (queries) {
  var qs = []

  do {
    queries = doMatch(queries, qs)
  } while (queries)

  return qs
}

/**
 * Find query matches in a string. This function is meant to be called
 * repeatedly with the returned query string until there is no more matches.
 * @param {string} string A string with one or more queries.
 * @param {BrowserslistQuery[]} qs Out parameter,
 * will be filled with `BrowserslistQuery`.
 * @returns {string} The rest of the query string minus the matched part.
 */
function doMatch (string, qs) {
  var or = /^(?:,\s*|\s+OR\s+)(.*)/i
  var and = /^\s+AND\s+(.*)/i

  return find(string, function (parsed, n, max) {
    if (and.test(parsed)) {
      qs.unshift({ type: QUERY_AND, queryString: parsed.match(and)[1] })
      return true
    } else if (or.test(parsed)) {
      qs.unshift({ type: QUERY_OR, queryString: parsed.match(or)[1] })
      return true
    } else if (n === max) {
      qs.unshift({ type: QUERY_OR, queryString: parsed.trim() })
      return true
    }
    return false
  })
}

function find (string, predicate) {
  for (var n = 1, max = string.length; n <= max; n++) {
    var parsed = string.substr(-n, n)
    if (predicate(parsed, n, max)) {
      return string.slice(0, -n)
    }
  }
  return ''
}

function flatten (array) {
  if (!Array.isArray(array)) return [array]
  return array.reduce(function (a, b) {
    return a.concat(flatten(b))
  }, [])
}

// Will be filled by Can I Use data below
browserslist.data = { }
browserslist.usage = {
  global: { },
  custom: null
}

// Default browsers query
browserslist.defaults = [
  '> 0.5%',
  'last 2 versions',
  'Firefox ESR',
  'not dead'
]

// Browser names aliases
browserslist.aliases = {
  fx: 'firefox',
  ff: 'firefox',
  ios: 'ios_saf',
  explorer: 'ie',
  blackberry: 'bb',
  explorermobile: 'ie_mob',
  operamini: 'op_mini',
  operamobile: 'op_mob',
  chromeandroid: 'and_chr',
  firefoxandroid: 'and_ff',
  ucandroid: 'and_uc',
  qqandroid: 'and_qq'
}

// Aliases to work with joined versions like `ios_saf 7.0-7.1`
browserslist.versionAliases = { }

browserslist.clearCaches = env.clearCaches
browserslist.parseConfig = env.parseConfig
browserslist.readConfig = env.readConfig
browserslist.findConfig = env.findConfig
browserslist.loadConfig = env.loadConfig

/**
 * Return browsers market coverage.
 *
 * @param {string[]} browsers Browsers names in Can I Use.
 * @param {string|object} [stats="global"] Which statistics should be used.
 *                                         Country code or custom statistics.
 *                                         Pass `"my stats"` to load statistics
 *                                         from Browserslist files.
 *
 * @return {number} Total market coverage for all selected browsers.
 *
 * @example
 * browserslist.coverage(browserslist('> 1% in US'), 'US') //=> 83.1
 */
browserslist.coverage = function (browsers, stats) {
  var data
  if (typeof stats === 'undefined') {
    data = browserslist.usage.global
  } else if (stats === 'my stats') {
    var opts = {}
    opts.path = path.resolve ? path.resolve('.') : '.'
    var customStats = env.getStat(opts)
    if (!customStats) {
      throw new BrowserslistError('Custom usage statistics was not provided')
    }
    data = {}
    for (var browser in customStats) {
      fillUsage(data, browser, customStats[browser])
    }
  } else if (typeof stats === 'string') {
    if (stats.length > 2) {
      stats = stats.toLowerCase()
    } else {
      stats = stats.toUpperCase()
    }
    env.loadCountry(browserslist.usage, stats)
    data = browserslist.usage[stats]
  } else {
    if ('dataByBrowser' in stats) {
      stats = stats.dataByBrowser
    }
    data = { }
    for (var name in stats) {
      for (var version in stats[name]) {
        data[name + ' ' + version] = stats[name][version]
      }
    }
  }

  return browsers.reduce(function (all, i) {
    var usage = data[i]
    if (usage === undefined) {
      usage = data[i.replace(/ \S+$/, ' 0')]
    }
    return all + (usage || 0)
  }, 0)
}

var QUERIES = [
  {
    regexp: /^last\s+(\d+)\s+major versions?$/i,
    select: function (context, versions) {
      return Object.keys(agents).reduce(function (selected, name) {
        var data = byName(name)
        if (!data) return selected
        var array = getMajorVersions(data.released, versions)

        array = array.map(nameMapper(data.name))
        return selected.concat(array)
      }, [])
    }
  },
  {
    regexp: /^last\s+(\d+)\s+versions?$/i,
    select: function (context, versions) {
      return Object.keys(agents).reduce(function (selected, name) {
        var data = byName(name)
        if (!data) return selected
        var array = data.released.slice(-versions)

        array = array.map(nameMapper(data.name))
        return selected.concat(array)
      }, [])
    }
  },
  {
    regexp: /^last\s+(\d+)\s+electron\s+major versions?$/i,
    select: function (context, versions) {
      var validVersions = getMajorVersions(Object.keys(e2c).reverse(), versions)
      return validVersions.map(function (i) {
        return 'chrome ' + e2c[i]
      })
    }
  },
  {
    regexp: /^last\s+(\d+)\s+(\w+)\s+major versions?$/i,
    select: function (context, versions, name) {
      var data = checkName(name)
      var validVersions = getMajorVersions(data.released, versions)
      return validVersions.map(nameMapper(data.name))
    }
  },
  {
    regexp: /^last\s+(\d+)\s+electron\s+versions?$/i,
    select: function (context, versions) {
      return Object.keys(e2c).reverse().slice(-versions).map(function (i) {
        return 'chrome ' + e2c[i]
      })
    }
  },
  {
    regexp: /^last\s+(\d+)\s+(\w+)\s+versions?$/i,
    select: function (context, versions, name) {
      var data = checkName(name)
      return data.released.slice(-versions).map(nameMapper(data.name))
    }
  },
  {
    regexp: /^unreleased\s+versions$/i,
    select: function () {
      return Object.keys(agents).reduce(function (selected, name) {
        var data = byName(name)
        if (!data) return selected
        var array = data.versions.filter(function (v) {
          return data.released.indexOf(v) === -1
        })

        array = array.map(nameMapper(data.name))
        return selected.concat(array)
      }, [])
    }
  },
  {
    regexp: /^unreleased\s+electron\s+versions?$/i,
    select: function () {
      return []
    }
  },
  {
    regexp: /^unreleased\s+(\w+)\s+versions?$/i,
    select: function (context, name) {
      var data = checkName(name)
      return data.versions.filter(function (v) {
        return data.released.indexOf(v) === -1
      }).map(nameMapper(data.name))
    }
  },
  {
    regexp: /^last\s+(\d*.?\d+)\s+years?$/i,
    select: function (context, years) {
      return filterByYear(Date.now() - YEAR * years)
    }
  },
  {
    regexp: /^since (\d+)(?:-(\d+))?(?:-(\d+))?$/i,
    select: function (context, year, month, date) {
      year = parseInt(year)
      month = parseInt(month || '01') - 1
      date = parseInt(date || '01')
      return filterByYear(Date.UTC(year, month, date, 0, 0, 0))
    }
  },
  {
    regexp: /^(>=?|<=?)\s*(\d*\.?\d+)%$/,
    select: function (context, sign, popularity) {
      popularity = parseFloat(popularity)
      var usage = browserslist.usage.global

      return Object.keys(usage).reduce(function (result, version) {
        if (sign === '>') {
          if (usage[version] > popularity) {
            result.push(version)
          }
        } else if (sign === '<') {
          if (usage[version] < popularity) {
            result.push(version)
          }
        } else if (sign === '<=') {
          if (usage[version] <= popularity) {
            result.push(version)
          }
        } else if (usage[version] >= popularity) {
          result.push(version)
        }
        return result
      }, [])
    }
  },
  {
    regexp: /^(>=?|<=?)\s*(\d*\.?\d+)%\s+in\s+my\s+stats$/,
    select: function (context, sign, popularity) {
      popularity = parseFloat(popularity)

      if (!context.customUsage) {
        throw new BrowserslistError('Custom usage statistics was not provided')
      }

      var usage = context.customUsage

      return Object.keys(usage).reduce(function (result, version) {
        if (sign === '>') {
          if (usage[version] > popularity) {
            result.push(version)
          }
        } else if (sign === '<') {
          if (usage[version] < popularity) {
            result.push(version)
          }
        } else if (sign === '<=') {
          if (usage[version] <= popularity) {
            result.push(version)
          }
        } else if (usage[version] >= popularity) {
          result.push(version)
        }
        return result
      }, [])
    }
  },
  {
    regexp: /^(>=?|<=?)\s*(\d*\.?\d+)%\s+in\s+((alt-)?\w\w)$/,
    select: function (context, sign, popularity, place) {
      popularity = parseFloat(popularity)

      if (place.length === 2) {
        place = place.toUpperCase()
      } else {
        place = place.toLowerCase()
      }

      env.loadCountry(browserslist.usage, place)
      var usage = browserslist.usage[place]

      return Object.keys(usage).reduce(function (result, version) {
        if (sign === '>') {
          if (usage[version] > popularity) {
            result.push(version)
          }
        } else if (sign === '<') {
          if (usage[version] < popularity) {
            result.push(version)
          }
        } else if (sign === '<=') {
          if (usage[version] <= popularity) {
            result.push(version)
          }
        } else if (usage[version] >= popularity) {
          result.push(version)
        }
        return result
      }, [])
    }
  },
  {
    regexp: /^cover\s+(\d*\.?\d+)%(\s+in\s+(my\s+stats|(alt-)?\w\w))?$/,
    select: function (context, coverage, statMode) {
      coverage = parseFloat(coverage)

      var usage = browserslist.usage.global
      if (statMode) {
        if (statMode.match(/^\s+in\s+my\s+stats$/)) {
          if (!context.customUsage) {
            throw new BrowserslistError(
              'Custom usage statistics was not provided'
            )
          }
          usage = context.customUsage
        } else {
          var match = statMode.match(/\s+in\s+((alt-)?\w\w)/)
          var place = match[1]
          if (place.length === 2) {
            place = place.toUpperCase()
          } else {
            place = place.toLowerCase()
          }
          env.loadCountry(browserslist.usage, place)
          usage = browserslist.usage[place]
        }
      }

      var versions = Object.keys(usage).sort(function (a, b) {
        return usage[b] - usage[a]
      })

      var coveraged = 0
      var result = []
      var version
      for (var i = 0; i <= versions.length; i++) {
        version = versions[i]
        if (usage[version] === 0) break

        coveraged += usage[version]
        result.push(version)
        if (coveraged >= coverage) break
      }

      return result
    }
  },
  {
    regexp: /^electron\s+([\d.]+)\s*-\s*([\d.]+)$/i,
    select: function (context, from, to) {
      if (!e2c[from]) {
        throw new BrowserslistError('Unknown version ' + from + ' of electron')
      }
      if (!e2c[to]) {
        throw new BrowserslistError('Unknown version ' + to + ' of electron')
      }

      from = parseFloat(from)
      to = parseFloat(to)

      return Object.keys(e2c).filter(function (i) {
        var parsed = parseFloat(i)
        return parsed >= from && parsed <= to
      }).map(function (i) {
        return 'chrome ' + e2c[i]
      })
    }
  },
  {
    regexp: /^(\w+)\s+([\d.]+)\s*-\s*([\d.]+)$/i,
    select: function (context, name, from, to) {
      var data = checkName(name)
      from = parseFloat(normalizeVersion(data, from) || from)
      to = parseFloat(normalizeVersion(data, to) || to)

      function filter (v) {
        var parsed = parseFloat(v)
        return parsed >= from && parsed <= to
      }

      return data.released.filter(filter).map(nameMapper(data.name))
    }
  },
  {
    regexp: /^electron\s*(>=?|<=?)\s*([\d.]+)$/i,
    select: function (context, sign, version) {
      return Object.keys(e2c)
        .filter(generateFilter(sign, version))
        .map(function (i) {
          return 'chrome ' + e2c[i]
        })
    }
  },
  {
    regexp: /^node\s*(>=?|<=?)\s*([\d.]+)$/i,
    select: function (context, sign, version) {
      var nodeVersions = jsReleases.filter(function (i) {
        return i.name === 'nodejs'
      }).map(function (i) {
        return i.version
      })
      return nodeVersions
        .filter(generateSemverFilter(sign, version))
        .map(function (v) {
          return 'node ' + v
        })
    }
  },
  {
    regexp: /^(\w+)\s*(>=?|<=?)\s*([\d.]+)$/,
    select: function (context, name, sign, version) {
      var data = checkName(name)
      var alias = browserslist.versionAliases[data.name][version]
      if (alias) {
        version = alias
      }
      return data.released
        .filter(generateFilter(sign, version))
        .map(function (v) {
          return data.name + ' ' + v
        })
    }
  },
  {
    regexp: /^(firefox|ff|fx)\s+esr$/i,
    select: function () {
      return ['firefox 60']
    }
  },
  {
    regexp: /(operamini|op_mini)\s+all/i,
    select: function () {
      return ['op_mini all']
    }
  },
  {
    regexp: /^electron\s+([\d.]+)$/i,
    select: function (context, version) {
      var chrome = e2c[version]
      if (!chrome) {
        throw new BrowserslistError(
          'Unknown version ' + version + ' of electron')
      }
      return ['chrome ' + chrome]
    }
  },
  {
    regexp: /^node\s+(\d+(\.\d+)?(\.\d+)?)$/i,
    select: function (context, version) {
      var nodeReleases = jsReleases.filter(function (i) {
        return i.name === 'nodejs'
      })
      var matched = nodeReleases.filter(function (i) {
        return isVersionsMatch(i.version, version)
      })
      if (matched.length === 0) {
        if (context.ignoreUnknownVersions) {
          return []
        } else {
          throw new BrowserslistError(
            'Unknown version ' + version + ' of Node.js')
        }
      }
      return ['node ' + matched[matched.length - 1].version]
    }
  },
  {
    regexp: /^current\s+node$/i,
    select: function (context) {
      return [env.currentNode(resolve, context)]
    }
  },
  {
    regexp: /^maintained\s+node\s+versions$/i,
    select: function (context) {
      var now = Date.now()
      var queries = Object.keys(jsEOL).filter(function (key) {
        return now < Date.parse(jsEOL[key].end) &&
          now > Date.parse(jsEOL[key].start) &&
          isEolReleased(key)
      }).map(function (key) {
        return 'node ' + key.slice(1)
      })
      return resolve(queries, context)
    }
  },
  {
    regexp: /^(\w+)\s+(tp|[\d.]+)$/i,
    select: function (context, name, version) {
      if (/^tp$/i.test(version)) version = 'TP'
      var data = checkName(name)
      var alias = normalizeVersion(data, version)
      if (alias) {
        version = alias
      } else {
        if (version.indexOf('.') === -1) {
          alias = version + '.0'
        } else {
          alias = version.replace(/\.0$/, '')
        }
        alias = normalizeVersion(data, alias)
        if (alias) {
          version = alias
        } else if (context.ignoreUnknownVersions) {
          return []
        } else {
          throw new BrowserslistError(
            'Unknown version ' + version + ' of ' + name)
        }
      }
      return [data.name + ' ' + version]
    }
  },
  {
    regexp: /^extends (.+)$/i,
    select: function (context, name) {
      return resolve(env.loadQueries(context, name), context)
    }
  },
  {
    regexp: /^defaults$/i,
    select: function () {
      return browserslist(browserslist.defaults)
    }
  },
  {
    regexp: /^dead$/i,
    select: function (context) {
      var dead = ['ie <= 10', 'ie_mob <= 10', 'bb <= 10', 'op_mob <= 12.1']
      return resolve(dead, context)
    }
  },
  {
    regexp: /^(\w+)$/i,
    select: function (context, name) {
      if (byName(name)) {
        throw new BrowserslistError(
          'Specify versions in Browserslist query for browser ' + name)
      } else {
        throw unknownQuery(name)
      }
    }
  }
];

// Get and convert Can I Use data

(function () {
  for (var name in agents) {
    var browser = agents[name]
    browserslist.data[name] = {
      name: name,
      versions: normalize(agents[name].versions),
      released: normalize(agents[name].versions.slice(0, -3)),
      releaseDate: agents[name].release_date
    }
    fillUsage(browserslist.usage.global, name, browser.usage_global)

    browserslist.versionAliases[name] = { }
    for (var i = 0; i < browser.versions.length; i++) {
      var full = browser.versions[i]
      if (!full) continue

      if (full.indexOf('-') !== -1) {
        var interval = full.split('-')
        for (var j = 0; j < interval.length; j++) {
          browserslist.versionAliases[name][interval[j]] = full
        }
      }
    }
  }
}())

module.exports = browserslist

},{"./error":3,"./node":2,"caniuse-lite/dist/unpacker/agents":8,"electron-to-chromium/versions":11,"node-releases/data/processed/envs.json":12,"node-releases/data/release-schedule/release-schedule.json":13,"path":1}],5:[function(require,module,exports){
module.exports={A:{A:{K:0.00970932,D:0.00970932,G:0.126221,E:0.189332,A:0.0582559,B:2.26227,hB:0.009298},B:"ms",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","hB","K","D","G","E","A","B","","",""],E:"IE",F:{hB:962323200,K:998870400,D:1161129600,G:1237420800,E:1300060800,A:1346716800,B:1381968000}},B:{A:{"2":0.0188,C:0.0188,d:0.0376,J:0.0423,M:0.1128,H:1.3207,I:0.6251},B:"ms",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","C","2","d","J","M","H","I","","",""],E:"Edge",F:{"2":1447286400,C:1438128000,d:1470096000,J:1491868800,M:1508198400,H:1525046400,I:1542067200}},C:{A:{"0":0.0329,"1":0.0235,"2":0.004486,"3":0.7661,"4":0.0329,"6":0.004707,"7":0.1739,"8":0.0282,"9":0.0235,eB:0.004827,DB:0.004707,F:0.0094,N:0.004879,K:0.020136,D:0.005725,G:0.004725,E:0.00533,A:0.004283,B:0.0047,C:0.004471,d:0.00453,J:0.004827,M:0.004417,H:0.0047,I:0.004393,O:0.004443,P:0.004283,Q:0.008652,R:0.004393,S:0.004827,T:0.008786,U:0.004326,V:0.004317,W:0.004393,X:0.004418,Y:0.008834,Z:0.004725,a:0.0094,b:0.004471,c:0.004725,e:0.0188,f:0.004417,g:0.004783,h:0.0094,i:0.004783,j:0.0047,k:0.0047,l:0.0047,m:0.0188,n:0.0094,o:0.0188,L:0.0047,q:0.0658,r:0.0658,s:0.0094,t:0.0141,u:0.0141,v:0.2068,w:0.0094,x:0.0141,y:0.0141,z:0.047,HB:0.0235,GB:0.0376,BB:0.0799,CB:2.5991,FB:0,YB:0.008786,XB:0.009414},B:"moz",C:["","","","eB","DB","YB","XB","F","N","K","D","G","E","A","B","C","2","d","J","M","H","I","O","P","Q","R","S","T","U","V","W","X","Y","Z","a","b","c","6","e","f","g","h","i","j","k","l","m","n","o","L","q","r","s","t","u","v","w","x","y","z","0","1","HB","7","8","9","GB","BB","CB","3","4","FB",""],E:"Firefox",F:{"0":1510617600,"1":1516665600,"2":1335225600,"3":1552953600,"4":null,"6":1417392000,"7":1525824000,"8":1529971200,"9":1536105600,eB:1161648000,DB:1213660800,YB:1246320000,XB:1264032000,F:1300752000,N:1308614400,K:1313452800,D:1317081600,G:1317081600,E:1320710400,A:1324339200,B:1327968000,C:1331596800,d:1338854400,J:1342483200,M:1346112000,H:1349740800,I:1353628800,O:1357603200,P:1361232000,Q:1364860800,R:1368489600,S:1372118400,T:1375747200,U:1379376000,V:1386633600,W:1391472000,X:1395100800,Y:1398729600,Z:1402358400,a:1405987200,b:1409616000,c:1413244800,e:1421107200,f:1424736000,g:1428278400,h:1431475200,i:1435881600,j:1439251200,k:1442880000,l:1446508800,m:1450137600,n:1453852800,o:1457395200,L:1461628800,q:1465257600,r:1470096000,s:1474329600,t:1479168000,u:1485216000,v:1488844800,w:1492560000,x:1497312000,y:1502150400,z:1506556800,HB:1520985600,GB:1540252800,BB:1544486400,CB:1548720000,FB:null}},D:{A:{"0":0.1034,"1":0.0799,"2":0.004879,"3":0.0893,"4":0.1927,"6":0.0141,"7":0.0282,"8":0.4136,"9":0.0705,F:0.004706,N:0.004879,K:0.004879,D:0.005591,G:0.005591,E:0.005591,A:0.004534,B:0.0047,C:0.010424,d:0.004706,J:0.0141,M:0.004393,H:0.004393,I:0.008652,O:0.004418,P:0.004393,Q:0.004317,R:0.0188,S:0.008786,T:0.014481,U:0.0047,V:0.0094,W:0.004326,X:0.0047,Y:0.094,Z:0.0047,a:0.0235,b:0.0094,c:0.0141,e:0.0047,f:0.0094,g:0.0047,h:0.0329,i:0.0094,j:0.0282,k:0.0282,l:0.0047,m:0.0376,n:0.0094,o:0.0141,L:0.0141,q:0.0188,r:0.047,s:0.4982,t:0.0141,u:0.0235,v:0.0141,w:0.0235,x:0.0423,y:0.0564,z:0.0611,HB:0.0376,GB:0.3666,BB:0.0705,CB:0.141,FB:0.1598,RB:0.2021,MB:0.2585,LB:0.7661,kB:20.5014,JB:6.5001,NB:0.047,OB:0.0141,PB:0},B:"webkit",C:["F","N","K","D","G","E","A","B","C","2","d","J","M","H","I","O","P","Q","R","S","T","U","V","W","X","Y","Z","a","b","c","6","e","f","g","h","i","j","k","l","m","n","o","L","q","r","s","t","u","v","w","x","y","z","0","1","HB","7","8","9","GB","BB","CB","3","4","FB","RB","MB","LB","kB","JB","NB","OB","PB"],E:"Chrome",F:{"0":1489017600,"1":1492560000,"2":1312243200,"3":1523923200,"4":1527552000,"6":1397001600,"7":1500940800,"8":1504569600,"9":1508198400,F:1264377600,N:1274745600,K:1283385600,D:1287619200,G:1291248000,E:1296777600,A:1299542400,B:1303862400,C:1307404800,d:1316131200,J:1316131200,M:1319500800,H:1323734400,I:1328659200,O:1332892800,P:1337040000,Q:1340668800,R:1343692800,S:1348531200,T:1352246400,U:1357862400,V:1361404800,W:1364428800,X:1369094400,Y:1374105600,Z:1376956800,a:1384214400,b:1389657600,c:1392940800,e:1400544000,f:1405468800,g:1409011200,h:1412640000,i:1416268800,j:1421798400,k:1425513600,l:1429401600,m:1432080000,n:1437523200,o:1441152000,L:1444780800,q:1449014400,r:1453248000,s:1456963200,t:1460592000,u:1464134400,v:1469059200,w:1472601600,x:1476230400,y:1480550400,z:1485302400,HB:1496707200,GB:1512518400,BB:1516752000,CB:1520294400,FB:1532390400,RB:1536019200,MB:1539648000,LB:1543968000,kB:1548720000,JB:1552348800,NB:null,OB:null,PB:null}},E:{A:{"5":0.0705,F:0,N:0.0047,K:0.004349,D:0.0094,G:0.0423,E:0.047,A:0.0329,B:0.0799,C:1.833,QB:0,IB:0.008692,SB:0.3055,TB:0.0188,UB:0.004283,VB:0.0658,WB:0.1645,p:0.3102,ZB:0},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","QB","IB","F","N","SB","K","TB","D","UB","G","E","VB","A","WB","B","p","C","5","ZB","",""],E:"Safari",F:{"5":1553472000,QB:1205798400,IB:1226534400,F:1244419200,N:1275868800,SB:1311120000,K:1343174400,TB:1382400000,D:1382400000,UB:1410998400,G:1413417600,E:1443657600,VB:1458518400,A:1474329600,WB:1490572800,B:1505779200,p:1522281600,C:1537142400,ZB:null}},F:{A:{"0":0.0141,"1":0.9635,"5":0.0188,"6":0.009758,E:0.0082,B:0.016581,C:0.004317,J:0.00685,M:0.00685,H:0.00685,I:0.005014,O:0.006015,P:0.004879,Q:0.006597,R:0.006597,S:0.013434,T:0.006702,U:0.006015,V:0.005595,W:0.004393,X:0.008652,Y:0.004879,Z:0.004879,a:0.0047,b:0.005152,c:0.005014,e:0.004879,f:0.0188,g:0.004283,h:0.004367,i:0.004534,j:0.004367,k:0.004227,l:0.004418,m:0.0141,n:0.004227,o:0.004725,L:0.004417,q:0.008942,r:0.004707,s:0.004827,t:0.004707,u:0.004707,v:0.004326,w:0.004783,x:0.014349,y:0.004725,z:0.0141,aB:0.00685,bB:0,cB:0.008392,dB:0.004706,p:0.006229,AB:0.004879,fB:0.008786},B:"webkit",C:["","","","","","","","","","","","","","","","E","aB","bB","cB","dB","B","p","AB","fB","C","5","J","M","H","I","O","P","Q","R","S","T","U","V","W","X","Y","Z","a","b","c","6","e","f","g","h","i","j","k","l","m","n","o","L","q","r","s","t","u","v","w","x","y","z","0","1","","",""],E:"Opera",F:{"0":1543363200,"1":1548201600,"5":1352073600,"6":1449100800,E:1150761600,aB:1223424000,bB:1251763200,cB:1267488000,dB:1277942400,B:1292457600,p:1302566400,AB:1309219200,fB:1323129600,C:1323129600,J:1372723200,M:1377561600,H:1381104000,I:1386288000,O:1390867200,P:1393891200,Q:1399334400,R:1401753600,S:1405987200,T:1409616000,U:1413331200,V:1417132800,W:1422316800,X:1425945600,Y:1430179200,Z:1433808000,a:1438646400,b:1442448000,c:1445904000,e:1454371200,f:1457308800,g:1462320000,h:1465344000,i:1470096000,j:1474329600,k:1477267200,l:1481587200,m:1486425600,n:1490054400,o:1494374400,L:1498003200,q:1502236800,r:1506470400,s:1510099200,t:1515024000,u:1517961600,v:1521676800,w:1525910400,x:1530144000,y:1534982400,z:1537833600},D:{"5":"o",E:"o",B:"o",C:"o",aB:"o",bB:"o",cB:"o",dB:"o",p:"o",AB:"o",fB:"o"}},G:{A:{G:0.145666,IB:0.00434823,gB:0.00217411,EB:0.00217411,iB:0.0119576,jB:0.00543529,KB:0.0217411,lB:0.0467435,mB:0.0293505,nB:0.211976,oB:0.117402,pB:0.283722,qB:0.359816,rB:0.772898,sB:8.72146,tB:0.122837},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","IB","gB","EB","iB","jB","KB","G","lB","mB","nB","oB","pB","qB","rB","sB","tB","",""],E:"iOS Safari",F:{IB:1270252800,gB:1283904000,EB:1299628800,iB:1331078400,jB:1359331200,KB:1394409600,G:1410912000,lB:1413763200,mB:1442361600,nB:1458518400,oB:1473724800,pB:1490572800,qB:1505779200,rB:1522281600,sB:1537142400,tB:null}},H:{A:{uB:1.60566},B:"o",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","uB","","",""],E:"Opera Mini",F:{uB:1426464000}},I:{A:{"4":0,DB:0.000727874,F:0.103358,vB:0.00436724,wB:0.00946236,xB:0.00655086,yB:0.0560463,EB:0.2089,zB:0,"0B":0.326087},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","vB","wB","xB","DB","F","yB","EB","zB","0B","4","","",""],E:"Android Browser",F:{"4":1494115200,vB:1256515200,wB:1274313600,xB:1291593600,DB:1298332800,F:1318896000,yB:1341792000,EB:1374624000,zB:1386547200,"0B":1401667200}},J:{A:{D:0.00424,A:0.01696},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","D","A","","",""],E:"Blackberry Browser",F:{D:1325376000,A:1359504000}},K:{A:{"5":0,A:0,B:0,C:0,L:0.0111391,p:0,AB:0},B:"o",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","A","B","p","AB","C","5","L","","",""],E:"Opera Mobile",F:{"5":1349740800,A:1287100800,B:1300752000,p:1314835200,AB:1318291200,C:1330300800,L:1474588800},D:{L:"webkit"}},L:{A:{JB:32.6856},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","JB","","",""],E:"Chrome for Android",F:{JB:1552348800}},M:{A:{"3":0.1855},B:"moz",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","3","","",""],E:"Firefox for Android",F:{"3":1552953600}},N:{A:{A:0.0115934,B:0.106},B:"ms",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","A","B","","",""],E:"IE Mobile",F:{A:1340150400,B:1353456000}},O:{A:{"1B":3.4662},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","1B","","",""],E:"UC Browser for Android",F:{"1B":1471392000},D:{"1B":"webkit"}},P:{A:{F:0.575418,"2B":0.0523107,"3B":0.0941592,"4B":0.29294,"5B":2.24936,"6B":0.355713},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","F","2B","3B","4B","5B","6B","","",""],E:"Samsung Internet",F:{F:1461024000,"2B":1481846400,"3B":1509408000,"4B":1528329600,"5B":1546128000,"6B":1554163200}},Q:{A:{"7B":0.1219},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","7B","","",""],E:"QQ Browser",F:{"7B":1483228800}},R:{A:{"8B":0},B:"webkit",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","8B","","",""],E:"Baidu Browser",F:{"8B":1491004800}},S:{A:{"9B":0.4452},B:"moz",C:["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","9B","","",""],E:"KaiOS Browser",F:{"9B":1527811200}}};

},{}],6:[function(require,module,exports){
module.exports={"0":"57","1":"58","2":"13","3":"66","4":"67","5":"12.1","6":"34","7":"60","8":"61","9":"62",A:"10",B:"11",C:"12",D:"7",E:"9",F:"4",G:"8",H:"17",I:"18",J:"15",K:"6",L:"46",M:"16",N:"5",O:"19",P:"20",Q:"21",R:"22",S:"23",T:"24",U:"25",V:"26",W:"27",X:"28",Y:"29",Z:"30",a:"31",b:"32",c:"33",d:"14",e:"35",f:"36",g:"37",h:"38",i:"39",j:"40",k:"41",l:"42",m:"43",n:"44",o:"45",p:"11.1",q:"47",r:"48",s:"49",t:"50",u:"51",v:"52",w:"53",x:"54",y:"55",z:"56",AB:"11.5",BB:"64",CB:"65",DB:"3",EB:"4.2-4.3",FB:"68",GB:"63",HB:"59",IB:"3.2",JB:"73",KB:"7.0-7.1",LB:"71",MB:"70",NB:"74",OB:"75",PB:"76",QB:"3.1",RB:"69",SB:"5.1",TB:"6.1",UB:"7.1",VB:"9.1",WB:"10.1",XB:"3.6",YB:"3.5",ZB:"TP",aB:"9.5-9.6",bB:"10.0-10.1",cB:"10.5",dB:"10.6",eB:"2",fB:"11.6",gB:"4.0-4.1",hB:"5.5",iB:"5.0-5.1",jB:"6.0-6.1",kB:"72",lB:"8.1-8.4",mB:"9.0-9.2",nB:"9.3",oB:"10.0-10.2",pB:"10.3",qB:"11.0-11.2",rB:"11.3-11.4",sB:"12.0-12.1",tB:"12.2",uB:"all",vB:"2.1",wB:"2.2",xB:"2.3",yB:"4.1",zB:"4.4","0B":"4.4.3-4.4.4","1B":"11.8","2B":"5.0-5.4","3B":"6.2-6.4","4B":"7.2-7.4","5B":"8.2","6B":"9.2","7B":"1.2","8B":"7.12","9B":"2.5"};

},{}],7:[function(require,module,exports){
module.exports={A:"ie",B:"edge",C:"firefox",D:"chrome",E:"safari",F:"opera",G:"ios_saf",H:"op_mini",I:"android",J:"bb",K:"op_mob",L:"and_chr",M:"and_ff",N:"ie_mob",O:"and_uc",P:"samsung",Q:"and_qq",R:"baidu",S:"kaios"};

},{}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.agents = undefined;

var _browsers = require('./browsers');

var _browserVersions = require('./browserVersions');

var agentsData = require('../../data/agents');

function unpackBrowserVersions(versionsData) {
    return Object.keys(versionsData).reduce(function (usage, version) {
        usage[_browserVersions.browserVersions[version]] = versionsData[version];
        return usage;
    }, {});
}

var agents = exports.agents = Object.keys(agentsData).reduce(function (map, key) {
    var versionsData = agentsData[key];
    map[_browsers.browsers[key]] = Object.keys(versionsData).reduce(function (data, entry) {
        if (entry === 'A') {
            data.usage_global = unpackBrowserVersions(versionsData[entry]);
        } else if (entry === 'C') {
            data.versions = versionsData[entry].reduce(function (list, version) {
                if (version === '') {
                    list.push(null);
                } else {
                    list.push(_browserVersions.browserVersions[version]);
                }
                return list;
            }, []);
        } else if (entry === 'D') {
            data.prefix_exceptions = unpackBrowserVersions(versionsData[entry]);
        } else if (entry === 'E') {
            data.browser = versionsData[entry];
        } else if (entry === 'F') {
            data.release_date = Object.keys(versionsData[entry]).reduce(function (map, key) {
                map[_browserVersions.browserVersions[key]] = versionsData[entry][key];
                return map;
            }, {});
        } else {
            // entry is B
            data.prefix = versionsData[entry];
        }
        return data;
    }, {});
    return map;
}, {});
},{"../../data/agents":5,"./browserVersions":9,"./browsers":10}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var browserVersions = exports.browserVersions = require('../../data/browserVersions');
},{"../../data/browserVersions":6}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var browsers = exports.browsers = require('../../data/browsers');
},{"../../data/browsers":7}],11:[function(require,module,exports){
module.exports = {
	"6.0": "76",
	"5.0": "72",
	"4.1": "69",
	"4.0": "69",
	"3.1": "66",
	"3.0": "66",
	"2.1": "61",
	"2.0": "61",
	"1.8": "59",
	"1.7": "58",
	"1.6": "56",
	"1.5": "54",
	"1.4": "53",
	"1.3": "52",
	"1.2": "51",
	"1.1": "50",
	"1.0": "49",
	"0.37": "49",
	"0.36": "47",
	"0.35": "45",
	"0.34": "45",
	"0.33": "45",
	"0.32": "45",
	"0.31": "44",
	"0.30": "44",
	"0.29": "43",
	"0.28": "43",
	"0.27": "42",
	"0.26": "42",
	"0.25": "42",
	"0.24": "41",
	"0.23": "41",
	"0.22": "41",
	"0.21": "40",
	"0.20": "39"
};
},{}],12:[function(require,module,exports){
module.exports=[
  {
    "name": "nodejs",
    "version": "0.2.0",
    "date": "2011-08-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.3.0",
    "date": "2011-08-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.4.0",
    "date": "2011-08-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.5.0",
    "date": "2011-08-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.6.0",
    "date": "2011-11-04",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.7.0",
    "date": "2012-01-17",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.8.0",
    "date": "2012-06-22",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.9.0",
    "date": "2012-07-20",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.10.0",
    "date": "2013-03-11",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.11.0",
    "date": "2013-03-28",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "0.12.0",
    "date": "2015-02-06",
    "lts": false
  },
  {
    "name": "iojs",
    "version": "1.0.0",
    "date": "2015-01-14"
  },
  {
    "name": "iojs",
    "version": "1.1.0",
    "date": "2015-02-03"
  },
  {
    "name": "iojs",
    "version": "1.2.0",
    "date": "2015-02-11"
  },
  {
    "name": "iojs",
    "version": "1.3.0",
    "date": "2015-02-20"
  },
  {
    "name": "iojs",
    "version": "1.5.0",
    "date": "2015-03-06"
  },
  {
    "name": "iojs",
    "version": "1.6.0",
    "date": "2015-03-20"
  },
  {
    "name": "iojs",
    "version": "2.0.0",
    "date": "2015-05-04"
  },
  {
    "name": "iojs",
    "version": "2.1.0",
    "date": "2015-05-24"
  },
  {
    "name": "iojs",
    "version": "2.2.0",
    "date": "2015-06-01"
  },
  {
    "name": "iojs",
    "version": "2.3.0",
    "date": "2015-06-13"
  },
  {
    "name": "iojs",
    "version": "2.4.0",
    "date": "2015-07-17"
  },
  {
    "name": "iojs",
    "version": "2.5.0",
    "date": "2015-07-28"
  },
  {
    "name": "iojs",
    "version": "3.0.0",
    "date": "2015-08-04"
  },
  {
    "name": "iojs",
    "version": "3.1.0",
    "date": "2015-08-19"
  },
  {
    "name": "iojs",
    "version": "3.2.0",
    "date": "2015-08-25"
  },
  {
    "name": "iojs",
    "version": "3.3.0",
    "date": "2015-09-02"
  },
  {
    "name": "nodejs",
    "version": "4.0.0",
    "date": "2015-09-08",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "4.1.0",
    "date": "2015-09-17",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "4.2.0",
    "date": "2015-10-12",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.3.0",
    "date": "2016-02-09",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.4.0",
    "date": "2016-03-08",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.5.0",
    "date": "2016-08-16",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.6.0",
    "date": "2016-09-27",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.7.0",
    "date": "2016-12-06",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.8.0",
    "date": "2017-02-21",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "4.9.0",
    "date": "2018-03-28",
    "lts": "Argon"
  },
  {
    "name": "nodejs",
    "version": "5.0.0",
    "date": "2015-10-29",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.1.0",
    "date": "2015-11-17",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.2.0",
    "date": "2015-12-09",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.3.0",
    "date": "2015-12-15",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.4.0",
    "date": "2016-01-06",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.5.0",
    "date": "2016-01-21",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.6.0",
    "date": "2016-02-09",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.7.0",
    "date": "2016-02-23",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.8.0",
    "date": "2016-03-09",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.9.0",
    "date": "2016-03-16",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.10.0",
    "date": "2016-04-01",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.11.0",
    "date": "2016-04-21",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "5.12.0",
    "date": "2016-06-23",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.0.0",
    "date": "2016-04-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.1.0",
    "date": "2016-05-05",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.2.0",
    "date": "2016-05-17",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.3.0",
    "date": "2016-07-06",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.4.0",
    "date": "2016-08-12",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.5.0",
    "date": "2016-08-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.6.0",
    "date": "2016-09-14",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.7.0",
    "date": "2016-09-27",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.8.0",
    "date": "2016-10-12",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "6.9.0",
    "date": "2016-10-18",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.10.0",
    "date": "2017-02-21",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.11.0",
    "date": "2017-06-06",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.12.0",
    "date": "2017-11-06",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.13.0",
    "date": "2018-02-10",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.14.0",
    "date": "2018-03-28",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.15.0",
    "date": "2018-11-27",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.16.0",
    "date": "2018-12-26",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "6.17.0",
    "date": "2019-02-28",
    "lts": "Boron"
  },
  {
    "name": "nodejs",
    "version": "7.0.0",
    "date": "2016-10-25",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.1.0",
    "date": "2016-11-08",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.2.0",
    "date": "2016-11-22",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.3.0",
    "date": "2016-12-20",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.4.0",
    "date": "2017-01-04",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.5.0",
    "date": "2017-01-31",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.6.0",
    "date": "2017-02-21",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.7.0",
    "date": "2017-02-28",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.8.0",
    "date": "2017-03-29",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.9.0",
    "date": "2017-04-11",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "7.10.0",
    "date": "2017-05-02",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.0.0",
    "date": "2017-05-30",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.1.0",
    "date": "2017-06-08",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.2.0",
    "date": "2017-07-19",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.3.0",
    "date": "2017-08-08",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.4.0",
    "date": "2017-08-15",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.5.0",
    "date": "2017-09-12",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.6.0",
    "date": "2017-09-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.7.0",
    "date": "2017-10-11",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.8.0",
    "date": "2017-10-24",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "8.9.0",
    "date": "2017-10-31",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.10.0",
    "date": "2018-03-06",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.11.0",
    "date": "2018-03-28",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.12.0",
    "date": "2018-09-10",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.13.0",
    "date": "2018-11-20",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.14.0",
    "date": "2018-11-27",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.15.0",
    "date": "2018-12-26",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "8.16.0",
    "date": "2019-04-16",
    "lts": "Carbon"
  },
  {
    "name": "nodejs",
    "version": "9.0.0",
    "date": "2017-10-31",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.1.0",
    "date": "2017-11-07",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.2.0",
    "date": "2017-11-14",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.3.0",
    "date": "2017-12-12",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.4.0",
    "date": "2018-01-10",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.5.0",
    "date": "2018-01-31",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.6.0",
    "date": "2018-02-21",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.7.0",
    "date": "2018-03-01",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.8.0",
    "date": "2018-03-07",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.9.0",
    "date": "2018-03-21",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.10.0",
    "date": "2018-03-28",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "9.11.0",
    "date": "2018-04-04",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.0.0",
    "date": "2018-04-24",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.1.0",
    "date": "2018-05-08",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.2.0",
    "date": "2018-05-23",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.3.0",
    "date": "2018-05-29",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.4.0",
    "date": "2018-06-06",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.5.0",
    "date": "2018-06-20",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.6.0",
    "date": "2018-07-04",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.7.0",
    "date": "2018-07-18",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.8.0",
    "date": "2018-08-01",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.9.0",
    "date": "2018-08-15",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.10.0",
    "date": "2018-09-06",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.11.0",
    "date": "2018-09-19",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.12.0",
    "date": "2018-10-10",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "10.13.0",
    "date": "2018-10-30",
    "lts": "Dubnium"
  },
  {
    "name": "nodejs",
    "version": "10.14.0",
    "date": "2018-11-27",
    "lts": "Dubnium"
  },
  {
    "name": "nodejs",
    "version": "10.15.0",
    "date": "2018-12-26",
    "lts": "Dubnium"
  },
  {
    "name": "nodejs",
    "version": "11.0.0",
    "date": "2018-10-23",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.1.0",
    "date": "2018-10-30",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.2.0",
    "date": "2018-11-15",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.3.0",
    "date": "2018-11-27",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.4.0",
    "date": "2018-12-07",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.5.0",
    "date": "2018-12-18",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.6.0",
    "date": "2018-12-26",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.7.0",
    "date": "2019-01-17",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.8.0",
    "date": "2019-01-24",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.9.0",
    "date": "2019-01-30",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.10.0",
    "date": "2019-02-14",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.11.0",
    "date": "2019-03-05",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.12.0",
    "date": "2019-03-14",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.13.0",
    "date": "2019-03-28",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "11.14.0",
    "date": "2019-04-10",
    "lts": false
  },
  {
    "name": "nodejs",
    "version": "12.0.0",
    "date": "2019-04-23",
    "lts": false
  }
]
},{}],13:[function(require,module,exports){
module.exports={
  "v0.10": {
    "start": "2013-03-11",
    "end": "2016-10-31"
  },
  "v0.12": {
    "start": "2015-02-06",
    "end": "2016-12-31"
  },
  "v4": {
    "start": "2015-09-08",
    "lts": "2015-10-12",
    "maintenance": "2017-04-01",
    "end": "2018-04-30",
    "codename": "Argon"
  },
  "v5": {
    "start": "2015-10-29",
    "maintenance": "2016-04-30",
    "end": "2016-06-30"
  },
  "v6": {
    "start": "2016-04-26",
    "lts": "2016-10-18",
    "maintenance": "2018-04-30",
    "end": "2019-04-30",
    "codename": "Boron"
  },
  "v7": {
    "start": "2016-10-25",
    "maintenance": "2017-04-30",
    "end": "2017-06-30"
  },
  "v8": {
    "start": "2017-05-30",
    "lts": "2017-10-31",
    "maintenance": "2019-01-01",
    "end": "2019-12-31",
    "codename": "Carbon"
  },
  "v9": {
    "start": "2017-10-01",
    "maintenance": "2018-04-01",
    "end": "2018-06-30"
  },
  "v10": {
    "start": "2018-04-24",
    "lts": "2018-10-30",
    "maintenance": "2020-04-01",
    "end": "2021-04-01",
    "codename": "Dubnium"
  },
  "v11": {
    "start": "2018-10-23",
    "maintenance": "2019-04-22",
    "end": "2019-06-01"
  },
  "v12": {
    "start": "2019-04-23",
    "lts": "2019-10-22",
    "maintenance": "2021-04-01",
    "end": "2022-04-01", 
    "codename": ""
  },
  "v13": {
    "start": "2019-10-22",
    "maintenance": "2020-04-20",
    "end": "2020-06-01"
  },
  "v14": {
    "start": "2020-04-21",
    "lts": "2020-10-20",
    "maintenance": "2022-04-01",
    "end": "2023-04-01",
    "codename": ""
  }
}

},{}],14:[function(require,module,exports){
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
    console.log(major, name);
  } else {
    console.log("error");
  }
};

request.send();

},{"browserslist":4}]},{},[14]);
