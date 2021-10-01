const axios = require('axios').default;
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

            // Check if merge is rejected due to an out of date branch
            if (_merge.data.errors.length == 1 && _merge.data.errors[0].message.includes('configured to require fast-forward merges')) {

                let _rebase = await rebase(pullRequest.id) // Do rebase

                if (String(_rebase.status).startsWith(2)) {
                    console.log("Pull request #" + pullRequest.id + " successfully rebased")

                    _merge = await merge(pullRequest.id) // Get merge status or do merge after rebase

                    // Check if merge status changed to require successfull builds after rebase
                    if (_merge.data.errors.length == 1 && _merge.data.errors[0].vetoes.some(veto => veto.summaryMessage.includes('Not all required builds are successful yet'))) {
                        while (String(_merge.status).startsWith(4)) { // Monitor pull request to merge after builds are successfull
                            _merge = await merge(pullRequest.id)

                            // TODO: break if merge failed or error has changed
                        }
                    }
                }

            } else {
                console.log("Skipping pull request #" + pullRequest.id + " due to other merge checks not passed\n")
            }

        } else {
            console.log('Pull request #' + pullRequest.id + ' is not labeled as automerge')
        }

        await new Promise(resolve => setTimeout(resolve, 1 * 1000));

    }

    await new Promise(resolve => setTimeout(resolve, 1 * 1000));
    main()

}

async function rebase(pullRequestId) {
    console.log("Rebasing pull request #" + pullRequestId)
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
    console.log("Merging pull request #" + pullRequestId)
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
    console.log("Checking if pull request #" + pullRequestId + " has auto merge label")
    try {
        let activities = await axios.get(process.env.BITBUCKET_PR_API + pullRequestId + '/activities')
        for (activity of activities.data.values) {
            if (activity.action == 'COMMENTED' && activity.comment.text == '>automerge') {
                return true
            }
        }
    } catch(error) {
        console.log(error.response.data)
        return false
    }
}

async function getPullRequests() {
    console.log("Getting list of pull requests")
    try {
        let pullRequests =  await axios.get(process.env.BITBUCKET_PR_API)
        return pullRequests.data.values
    } catch(error) {
        console.log(error.response)
        return []
    }
}

async function getPullRequest(pullRequestId) {
    console.log("Getting latest pull request revision #" + pullRequestId)
    try {
        let pullRequest =  await axios.get(process.env.BITBUCKET_PR_API + pullRequestId)
        return pullRequest.data
    } catch (error) {
        return error.response
    }
}
