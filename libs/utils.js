const moment = require('moment')

function hasOne(array) {
    return array.length === 1 ?? false
}

async function wait(seconds = 1) {
    return await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function log(message) {
    console.log(('[' + moment().format('YYYY/MM/DD HH:mm:ss') + '] ').gray + message)
}

module.exports = {
    hasOne,
    wait,
    log
}