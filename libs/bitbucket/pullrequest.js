require('colors');
require('dotenv').config()
const utils = require('../utils')
const httpStatus = require('../http-status')
const {bitbucketPrApi, bitbucketGitApi} = require('./api')
const HttpResponse = require('./http-response')

class PullRequest {

    constructor(pullRequestId) {
        this.id = pullRequestId.toString()
        this.merged = false
        this.mergeVetoes = []
    }

    async rebase() {
        utils.log("Rebasing pull request #" + this.id)
        try {
            let latestPullRequestRevision = await this.getPullRequest()
            return await bitbucketGitApi().post(this.id + '/rebase', {
                version: latestPullRequestRevision.version
            })
        } catch(error) {
            utils.log(error.response.data)
            return error.response
        }
    }

    async merge() {
        utils.log("Merging pull request #" + this.id)
        try {
            let latestPullRequestRevision = await this.getPullRequest()
            return await bitbucketPrApi().post(this.id + '/merge', {
                autoSubject: true,
                version: latestPullRequestRevision.version
            })
        } catch (error) {
            utils.log("Failed merging pull request #" + this.id + ": " + JSON.stringify(error.response.data.errors).red)
            this.mergeVetoes = error?.response?.data?.errors
            return error.response
        }
    }

    waitingForBuild() {
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

    // Experimental
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

    async rebaseAndMerge() {
        console.log("Rebase and merge is in progress...")

        // let retries = 0
        let _merge = await this.merge()

        while(httpStatus.isFailed(_merge)) {
            let _rebase = await this.rebase()

            if (httpStatus.isSuccessful(_rebase)) {

                let _merge = await this.merge()
                if (httpStatus.isSuccessful(_merge)) {
                    utils.log("Pull request #" + pullRequest.id + " successfully rebased")
                    break;
                } else {


                    utils.log("Retrying merge...".cyan)

                }

            } else {

                utils.log("Rebase Failed".red)

            }

            await utils.wait(process.env.MERGE_INTERVAL)
        }
    }
}

module.exports = PullRequest