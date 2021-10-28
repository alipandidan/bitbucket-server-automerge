require('colors');
require('dotenv').config()
const utils = require('../utils')
const {bitbucketPrApi, bitbucketGitApi} = require('./api')

class PullRequest {

    constructor(pullRequestId) {
        this.id = pullRequestId.toString()
        this.mergeVetoes = []
    }

    async rebase() {
        utils.log("Rebasing pull request #" + this.id)
        try {
            let latestPullRequestRevision = await this.getPullRequest()
            let _rebase = await bitbucketGitApi().post(this.id + '/rebase', {
                version: latestPullRequestRevision.version
            })

            // TODO: validate _rebase

            return true
        } catch(error) {
            utils.log(error.response.data)
            return false
        }
    }

    async merge() {
        utils.log("Merging pull request #" + this.id)
        try {
            let latestPullRequestRevision = await this.getPullRequest()

            let _merge = await bitbucketPrApi().post(this.id + '/merge', {
                autoSubject: true,
                version: latestPullRequestRevision.version
            })

            // TODO: validate _merge

            return true
        } catch (error) {
            utils.log("Failed merging pull request #" + this.id + ": " + JSON.stringify(error.response.data.errors).red)
            this.mergeVetoes = error?.response?.data?.errors
            return false
        }
    }

    isWaitingForBuild() {
        return utils.hasOne(this.mergeVetoes) && this.mergeVetoes.some(error =>
            error.vetoes?.some(veto =>
                veto.detailedMessage.includes('it has in-progress builds') ||
                veto.detailedMessage.includes('need a minimum of one successful build')
            )
        )
    }

    isOutOfDate() {
        return utils.hasOne(this.mergeVetoes) && this.mergeVetoes.some(error =>
            error.message?.includes('configured to require fast-forward merges')
        )
    }

    async canMerge() {
        utils.log("Getting pull request #" + this.id + " merge status")
        try {
            let _mergeStatus = await bitbucketPrApi().get(this.id + '/merge')
            if (_mergeStatus.data?.canMerge) {
                return true
            }
            return false
        } catch (error){
            log(error.red)
            return false
        }
    }

    // Experimental
    async notifyPullRequest() {
        try {
            return await bitbucketPrApi().post(this.id + '/comments', {
                text: ":robot: Automerge bot is running",
            })

        } catch (error) {
            console.log(error.response?.data)
            return false
        }
    }

    async isAutoMerge() {
        utils.log(("Checking if pull request #" + this.id + " has auto merge label"))
        try {
            let activities = await bitbucketPrApi().get(this.id + '/activities')

            let comments = activities.data.values.filter(activity => activity.action === 'COMMENTED')

            // if(!comments.find(activity => activity.comment.text.includes("Automerge bot is running"))) {
            //     notifyPullRequest(this.id)
            // }

            let isAutoMergeAllowed = comments.find(activity => activity.comment.text === '>automerge' && (!process.env.ALLOWED_USERS || process.env.ALLOWED_USERS.split(',').includes(activity.user.name)))

            return Boolean(isAutoMergeAllowed)

        } catch(error) {
            utils.log(error)
            return false
        }
    }

    async getPullRequest() {
        utils.log(("Getting latest pull request revision #" + this.id).cyan)
        try {
            let pullRequest =  await bitbucketPrApi().get(this.id)
            return pullRequest.data
        } catch (error) {
            utils.log(error)
            return null
        }
    }
}

module.exports = PullRequest