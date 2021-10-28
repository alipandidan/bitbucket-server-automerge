require('colors');
const utils = require('./libs/utils')
const repository = require('./libs/bitbucket/repository')
const PullRequest = require('./libs/bitbucket/pullrequest')
const { setTimeout: setTimeoutPromise } = require('timers/promises');

main()

async function main() {
    let pullRequests = await repository.openPullRequests()

    for(_pullRequest of pullRequests) {

        let pullRequest = new PullRequest(_pullRequest.id)

        if (await pullRequest.isAutoMerge() && await pullRequest.canMerge()) {

            let _merged = await pullRequest.merge()

            if (_merged) {
                utils.log(("Pull request #" + pullRequest.id + " successfully merged (No rebase needed)").green)
            } else {

                if (await pullRequest.isOutOfDate()) {

                    if (await pullRequest.rebase()) {
                        utils.log(("Pull request #" + pullRequest.id + " successfully rebased").green)

                        let retries = 0
                        while (!_merged) { // Monitor pull request to merge after builds are successfull
                            await utils.wait(process.env.MERGE_INTERVAL)
                            if (pullRequest.canMerge()) {
                                _merged = await pullRequest.merge()
                                if (_merged) {
                                    utils.log("Pull request successfuly merged after rebasing.".green)
                                    break;
                                } else {
                                    if (await !pullRequest.isWaitingForBuild() || retries > 60) {
                                        utils.log("Failed to merge pull request due to problems after rebase".red)
                                        break;
                                    }
                                }
                            } else {
                                utils.log("Merge check status for pull request #" + pullRequest.id + " changed after rebase\n")
                                break;
                            }
                            retries++
                        }

                    } else {
                        utils.log("Rebased failed for pull request #" + pullRequest.id)
                    }

                } else {
                    utils.log("Skipping pull request #" + pullRequest.id + " due to other merge checks not passed\n")
                    utils.log(JSON.stringify(_merge.data.errors))
                }
            }

        } else {
            utils.log(('Pull request #' + pullRequest.id + ' is not labeled as automerge or has failed checks').yellow)
        }

        await utils.wait(process.env.PROCESSING_INTERVAL)

    }

    utils.log("Finished parsing all pull requests, restarting in 5 seconds\n".cyan)
    setTimeout(main, process.env.PROCESSING_INTERVAL * 1000);
}
