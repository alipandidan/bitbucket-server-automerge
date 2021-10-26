require('colors');
require('dotenv').config()

const utils = require('../utils')
const {bitbucketPrApi, bitbucketGitApi} = require('./api')

class PullRequest {

    constructor(pullRequestId) {
        this.id = pullRequestId
    }

    async rebase() {
        utils.log("Rebasing pull request #" + this.id)
        try {
            let latestPullRequestRevision = await getPullRequest(this.id)
            return await bitbucketGitApi().post(this.id + '/rebase', {
                version: latestPullRequestRevision.version
            })
        } catch(error) {
            return error.response
        }
    }

    async merge() {
        utils.log("Merging pull request #" + this.id)
        try {
            let latestPullRequestRevision = await getPullRequest(this.id)
            return await bitbucketPrApi().post(this.id + '/merge', {
                autoSubject: true,
                version: latestPullRequestRevision.version
            })

        } catch (error) {
            return error.response
        }
    }

    async notifyPullRequest() {
        try {
            return await bitbucketPrApi().post(this.id + '/comments', {
                text: ":robot: Automerge bot is running",
            })

        } catch (error) {
            return error.response
        }
    }

    async isAutoMerge() {
        utils.log(("Checking if pull request #" + this.id + " has auto merge label").yellow)
        try {
            let activities = await bitbucketPrApi().get(this.id + '/activities')

            let comments = activities.data.values.filter(activity => activity.action === 'COMMENTED')

            // if(!comments.find(activity => activity.comment.text.includes("Automerge bot is running"))) {
            //     notifyPullRequest(this.id)
            // }

            let isAutoMergeAllowed = comments.find(activity => activity.comment.text === '>automerge' && (!process.env.ALLOWED_USERS || process.env.ALLOWED_USERS.split(',').includes(activity.user.name)))

            return Boolean(isAutoMergeAllowed)

        } catch(error) {
            return false
        }
    }

    async getPullRequest() {
        utils.log(("Getting latest pull request revision #" + this.id).cyan)
        try {
            let pullRequest =  await bitbucketPrApi().get(this.id)
            return pullRequest.data
        } catch (error) {
            return error.response
        }
    }
}

module.exports = PullRequest