const moment = require('moment')
const axios = require('axios').default
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
                log("Pull request #" + pullRequest.id + " successfully merged")
            } else if (isFailed(_merge)) { // Check if merge is rejected due to an out of date branch

                log("Failed merging pull request #" + pullRequest.id + ": " + JSON.stringify(_merge.data.errors))

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
                            //
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
            log('Pull request #' + pullRequest.id + ' is not labeled as automerge')
        }

        await wait(2)

    }

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
    console.log('[' + moment().format('YYYY/MM/DD HH:mm:ss') + '] ' + message)
}

async function rebase(pullRequestId) {
    log("Rebasing pull request #" + pullRequestId)
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

async function isAutoMerge(pullRequestId) {
    log("Checking if pull request #" + pullRequestId + " has auto merge label")
    try {
        let activities = await axios.get(process.env.BITBUCKET_PR_API + pullRequestId + '/activities')
        for (activity of activities.data.values) {
            if (activity.action == 'COMMENTED' &&
                activity.comment.text == '>automerge' &&
                (!process.env.ALLOWED_USERS || process.env.ALLOWED_USERS.split(',').includes(activity.user.name))
            ) {
                return true
            }
        }
    } catch(error) {
        console.log(error.response.data)
        return false
    }
}

async function getPullRequests() {
    log("Getting list of pull requests")
    try {
        let pullRequests =  await axios.get(process.env.BITBUCKET_PR_API)
        return pullRequests.data.values
    } catch(error) {
        log(JSON.stringify(error.response))
        return []
    }
}

async function getPullRequest(pullRequestId) {
    log("Getting latest pull request revision #" + pullRequestId)
    try {
        let pullRequest =  await axios.get(process.env.BITBUCKET_PR_API + pullRequestId)
        return pullRequest.data
    } catch (error) {
        return error.response
    }
}
