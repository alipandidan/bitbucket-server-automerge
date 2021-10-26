require('colors');
const utils = require('../utils')
const { bitbucketPrApi } = require('./api')


class Repository {
    static async openPullRequests() {
        utils.log("Getting list of pull requests".cyan)
        try {
            let pullRequests =  await bitbucketPrApi().get()
            return pullRequests.data.values
        } catch(error) {
            console.log(error)
            utils.log(JSON.stringify(error.response) || "Failed getting list of pull requests".red)
            return []
        }
    }
}

module.exports = Repository
