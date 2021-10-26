const moment = require('moment')
const axios = require('axios').default
require('colors');
require('dotenv').config()

// process.on('unhandledRejection', (reason, promise) => {
//     console.log('Unhandled Rejection at:', reason.stack || reason)
// })

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

                            if (isSuccessfull(_merge)) {
                                log("Pull request successfuly merged after rebasing.".green)
                            } else {

                                const prHasProblems = _merge.data.errors.some(error =>
                                    error.vetoes.some(veto => veto.detailedMessage.includes('approvals before this pull request can be merged'))
                                )

                                if (prHasProblems) {
                                    log("Failed to merge PR due to problems after rebase: ".red + JSON.stringify(_merge.data.errors))
                                    break;
                                }

                            }

                            await wait(10)
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

        await wait(5) // Timeout between each pull request processing

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
        return false
    }
}

async function getPullRequests() {
    log("Getting list of pull requests".cyan)
    try {
        let pullRequests =  await axios.get(process.env.BITBUCKET_PR_API)
        return pullRequests.data.values
    } catch(error) {
        log(JSON.stringify(error.response) || "Failed getting list of pull requests".red)
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
