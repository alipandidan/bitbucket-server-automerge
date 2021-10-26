function isSuccessfull(axios) {
    return String(axios.status).startsWith(2) ?? false
}

function isFailed(axios) {
    return String(axios.status).startsWith(4) ?? false
}

module.exports = {
    isSuccessfull,
    isFailed
}