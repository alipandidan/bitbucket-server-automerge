const moment = require('moment')
const axios = require('axios').default
require('colors');
require('dotenv').config()

axios.interceptors.request.use(function (config) {
    config.headers.Authorization = 'Bearer ' + process.env.BITBUCKET_TOKEN;
    return config;
});

main()

async function main() {
    let pullRequests = await getPullRequests()
    for(pullRequest of pullRequests) {

        if (await isAutoMerge(pullRequest.id)) {

            let _merge = await merge(pullRequest.id) // Check for merge vetoes or do merge if all checks are passed

            if (isSuccessfull(_merge)) {
                log(("Pull request #" + pullRequest.id + " successfully merged (No rebase needed)").green)
            } else if (isFailed(_merge)) {

                log("Failed merging pull request #" + pullRequest.id + ": " + JSON.stringify(_merge.data.errors))

                // Check if merge is rejected due to an out of date branch
                if (hasOne(_merge.data.errors) && _merge.data.errors.some(error => error.message.includes('configured to require fast-forward merges'))) {
                    let _rebase = await rebase(pullRequest.id) // Do rebase

                    if (isSuccessfull(_rebase)) {
                        log("Pull request #" + pullRequest.id + " successfully rebased")

                        _merge = await merge(pullRequest.id) // Get current merge status or do merge after rebase

                        while (isFailed(_merge)) { // Monitor pull request to merge after builds are successfull
                            _merge = await merge(pullRequest.id)
                            if(isFailed(_merge)) {
                                log(JSON.stringify(_merge.data.errors))
                            }

                            await wait(10)

                            // Should keep loop alive if there's only one error of type "com.atlassian.bitbucket.pull.PullRequestMergeVetoedException" where "detailedMessage" says either  "it has in-progress builds" or "need a minimum of one successful build"
                            // [{"context":null,"message":"Merging the pull request has been vetoed.","exceptionName":"com.atlassian.bitbucket.pull.PullRequestMergeVetoedException","conflicted":false,"vetoes":[{"summaryMessage":"Not all required builds are successful yet","detailedMessage":"You still need a minimum of one successful build before this pull request can be merged."},
                            // {"summaryMessage":"Requires approvals","detailedMessage":"You still need 2 approvals before this pull request can be merged."},{"summaryMessage":"Not all required reviewers have approved yet","detailedMessage":"At least 2 of the following users must review and approve this pull request before it can be merged."}]}]
                            // [{"context":null,"message":"Merging the pull request has been vetoed.","exceptionName":"com.atlassian.bitbucket.pull.PullRequestMergeVetoedException","conflicted":false,"vetoes":[{"summaryMessage":"Not all required builds are successful yet","detailedMessage":"You still need a minimum of one successful build before this pull request can be merged."}]}]
                            // [{"context":null,"message":"Merging the pull request has been vetoed.","exceptionName":"com.atlassian.bitbucket.pull.PullRequestMergeVetoedException","conflicted":false,"vetoes":[{"summaryMessage":"Not all required builds are successful yet","detailedMessage":"You cannot merge this pull request while it has in-progress builds."}]}]


                            // const shouldContinue = _merge.data.errors.some(error =>
                            //     error.vetoes.length == 1 &&
                            //     error.vetoes.some(veto => veto.detailedMessage.includes('it has in-progress builds'))
                            // )
                        }

                    } else {
                        console.log("Rebased failed for pull request #" + pullRequest.id)
                        log(JSON.stringify(_rebase.data.errors))
                    }
                }

            } else {
                log("Skipping pull request #" + pullRequest.id + " due to other merge checks not passed\n")
                log(JSON.stringify(_merge.data.errors))
            }

        } else {
            log(('Pull request #' + pullRequest.id + ' is not labeled as automerge').yellow)
        }

        await wait(2)

    }

    log("Finished parsing all pull requests, restarting in 5 seconds\n".cyan)
    setTimeout(main, 5 * 1000);
}

async function wait(seconds = 1) {
    return await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function hasOne(array) {
    return array.length === 1 ?? false
}

function isSuccessfull(axios) {
    return String(axios.status).startsWith(2) ?? false
}

function isFailed(axios) {
    return String(axios.status).startsWith(4) ?? false
}

function log(message) {
    console.log(('[' + moment().format('YYYY/MM/DD HH:mm:ss') + '] ').gray + message)
}

async function rebase(pullRequestId) {
    log("[" + arguments.callee.name + "] + Rebasing pull request #" + pullRequestId)
    try {
        let latestPullRequestRevision = await getPullRequest(pullRequestId)
        return await axios.post(process.env.BITBUCKET_PR_GIT_API + pullRequestId + '/rebase', {
            version: latestPullRequestRevision.version
        })
    } catch(error) {
        return error.response
    }
}

async function merge(pullRequestId) {
    log("Merging pull request #" + pullRequestId)
    try {
        let latestPullRequestRevision = await getPullRequest(pullRequestId)
        return await axios.post(process.env.BITBUCKET_PR_API + pullRequestId + '/merge', {
            autoSubject: true,
            version: latestPullRequestRevision.version
        })

    } catch (error) {
        return error.response
    }
}

async function notifyPullRequest(pullRequestId) {
    try {
        return await axios.post(process.env.BITBUCKET_PR_API + pullRequestId + '/comments', {
            text: ":robot: Automerge bot is running",
        })

    } catch (error) {
        return error.response
    }
}

async function isAutoMerge(pullRequestId) {
    log(("Checking if pull request #" + pullRequestId + " has auto merge label").yellow)
    try {
        let activities = await axios.get(process.env.BITBUCKET_PR_API + pullRequestId + '/activities')

        let comments = activities.data.values.filter(activity => activity.action === 'COMMENTED')

        // if(!comments.find(activity => activity.comment.text.includes("Automerge bot is running"))) {
        //     notifyPullRequest(pullRequestId)
        // }

        let isAutoMergeAllowed = comments.find(activity => activity.comment.text === '>automerge' && (!process.env.ALLOWED_USERS || process.env.ALLOWED_USERS.split(',').includes(activity.user.name)))

        return Boolean(isAutoMergeAllowed)

    } catch(error) {
        console.log(error.response.data)
        return false
    }
}

async function getPullRequests() {
    log("Getting list of pull requests".cyan)
    try {
        let pullRequests =  await axios.get(process.env.BITBUCKET_PR_API)
        return pullRequests.data.values
    } catch(error) {
        log(JSON.stringify(error.response))
        return []
    }
}

async function getPullRequest(pullRequestId) {
    log(("Getting latest pull request revision #" + pullRequestId).cyan)
    try {
        let pullRequest =  await axios.get(process.env.BITBUCKET_PR_API + pullRequestId)
        return pullRequest.data
    } catch (error) {
        return error.response
    }
}
