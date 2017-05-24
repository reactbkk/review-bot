
var GH_TOKEN = require('fs').readFileSync('secrets', 'utf8').match(/GH_TOKEN=(\w+)/)[1]

require('./index')({
  secrets: { GH_TOKEN }
}, (err, x) => {
  setTimeout(() => {
    if (err) throw err
    console.log('Ok done', x)
  })
})
