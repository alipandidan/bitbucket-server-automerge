require('colors');
const utils = require('./libs/utils')
const httpStatus = require('./libs/http-status')
const repository = require('./libs/bitbucket/repository')
const PullRequest = require('./libs/bitbucket/pullrequest')

main()

async function main() {
    let pullRequests = await repository.openPullRequests()

    for(_pullRequest of pullRequests) {

        let pullRequest = new PullRequest(_pullRequest.id)

        if (await pullRequest.isAutoMerge()) {

            let _merge = await pullRequest.merge() // Check for merge vetoes or perform merge if all checks are passed.

            if (httpStatus.isSuccessful(_merge)) {
                utils.log(("Pull request #" + pullRequest.id + " successfully merged (No rebase needed)").green)
            } else if (httpStatus.isFailed(_merge)) { // 4XX errors

                if (await pullRequest.isOutOfDate()) {

                    let _rebase = await pullRequest.rebase(pullRequest.id)

                    if (httpStatus.isSuccessful(_rebase)) {
                        utils.log(("Pull request #" + pullRequest.id + " successfully rebased").green)

                        let retries = 0
                        while (httpStatus.isFailed(_merge)) { // Monitor pull request to merge after builds are successfull
                            _merge = await pullRequest.merge()

                            if (httpStatus.isSuccessful(_merge)) {
                                utils.log("Pull request successfuly merged after rebasing.".green)
                            } else {
                                console.log(await !pullRequest.waitingForBuild())
                                if (await !pullRequest.waitingForBuild() || retries > 60) {
                                    utils.log("Failed to merge pull request due to problems after rebase".red)
                                    break;
                                }
                            }

                            retries++
                            await utils.wait(process.env.MERGE_INTERVAL) // Merge interval
                        }

                    } else {
                        utils.log("Rebased failed for pull request #" + pullRequest.id)
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
