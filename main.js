require('colors');
const utils = require('./libs/utils')
const repository = require('./libs/bitbucket/repository')
const PullRequest = require('./libs/bitbucket/pullrequest')


// process.on('unhandledRejection', (reason, promise) => {
//     console.log('Unhandled Rejection at:', reason.stack || reason)
// })

main()

async function main() {
    let pullRequests = await repository.openPullRequests()

    for(_pullRequest of pullRequests) {

        let pullRequest = new PullRequest(_pullRequest.id)

        if (await pullRequest.isAutoMerge()) {

            let _merge = await pullRequest.merge() // Check for merge vetoes or do merge if all checks are passed

            if (isSuccessfull(_merge)) {
                utils.log(("Pull request #" + pullRequest.id + " successfully merged (No rebase needed)").green)
            } else if (isFailed(_merge)) {

                utils.log("Failed merging pull request #" + pullRequest.id + ": " + JSON.stringify(_merge.data.errors))

                // Check if merge is rejected due to an out of date branch
                if (hasOne(_merge.data.errors) && _merge.data.errors.some(error => error.message.includes('configured to require fast-forward merges'))) {
                    let _rebase = await pullRequest.rebase(pullRequest.id) // Do rebase

                    if (isSuccessfull(_rebase)) {
                        utils.log("Pull request #" + pullRequest.id + " successfully rebased")

                        _merge = await pullRequest.merge() // Get current merge status or do merge after rebase

                        while (isFailed(_merge)) { // Monitor pull request to merge after builds are successfull
                            _merge = await pullRequest.merge()

                            if (isSuccessfull(_merge)) {
                                utils.log("Pull request successfuly merged after rebasing.".green)
                            } else {

                                const prHasProblems = _merge.data.errors.some(error =>
                                    error.vetoes.some(veto => veto.detailedMessage.includes('approvals before this pull request can be merged'))
                                )

                                if (prHasProblems) {
                                    utils.log("Failed to merge PR due to problems after rebase: ".red + JSON.stringify(_merge.data.errors))
                                    break;
                                }

                            }

                            await utils.wait(10)
                        }

                    } else {
                        utils.log("Rebased failed for pull request #" + pullRequest.id)
                        utils.log(JSON.stringify(_rebase.data.errors))
                    }
                }

            } else {
                utils.log("Skipping pull request #" + pullRequest.id + " due to other merge checks not passed\n")
                utils.log(JSON.stringify(_merge.data.errors))
            }

        } else {
            utils.log(('Pull request #' + pullRequest.id + ' is not labeled as automerge').yellow)
        }

        await utils.wait(5) // Timeout between each pull request processing

    }

    utils.log("Finished parsing all pull requests, restarting in 5 seconds\n".cyan)
    setTimeout(main, 5 * 1000);
}
