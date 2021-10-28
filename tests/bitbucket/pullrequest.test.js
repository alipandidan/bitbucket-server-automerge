const PullRequest = require('../../libs/bitbucket/pullrequest')

describe('bitbucket.pullRequest.waitingForBuild', () => {

    test('if pull request waiting for merge with no vetoes', () => {
        let pullRequest = new PullRequest(1)
        pullRequest.mergeVetoes = []
        expect(pullRequest.waitingForBuild()).toBe(false);
    });


    test('if fails with empty vetoes', () => {
        let pullRequest = new PullRequest(1)
        pullRequest.mergeVetoes = [
            {
              "context": null,
              "message": "Merging the pull request has been vetoed.",
              "exceptionName": "com.atlassian.bitbucket.pull.PullRequestMergeVetoedException",
              "conflicted": false,
            }
        ]
        expect(pullRequest.waitingForBuild()).toBe(false);
    });


    test('if waits on required approvals', () => {
        let pullRequest = new PullRequest(1)
        pullRequest.mergeVetoes = [{
            "context": null,
            "message": "Merging the pull request has been vetoed.",
            "exceptionName": "com.atlassian.bitbucket.pull.PullRequestMergeVetoedException",
            "conflicted": false,
            "vetoes": [{
                "summaryMessage": "Requires approvals",
                "detailedMessage": "You still need 1 approval before this pull request can be merged."
            }, {
                "summaryMessage": "Not all required reviewers have approved yet",
                "detailedMessage": "At least 2 of the following users must review and approve this pull request before it can be merged: Alona Luchkovska, Carl Jensen, Ricardo Hernandez Lopez, Tadas Butkevičius, Omkar Joshi, Nicholas Rydje, Ali Pandidan, Vladyslav Aleksholm, Philip Cheong."
            }]
        }]

        expect(pullRequest.waitingForBuild()).toBe(false);
    });


    test('if waits on combination of required builds and approvals', () => {
        let pullRequest = new PullRequest(1)
        pullRequest.mergeVetoes = [
            {
              "context": null,
              "message": "Merging the pull request has been vetoed.",
              "exceptionName": "com.atlassian.bitbucket.pull.PullRequestMergeVetoedException",
              "conflicted": false,
              "vetoes": [
                {
                  "summaryMessage": "Not all required builds are successful yet",
                  "detailedMessage": "You cannot merge this pull request while it has failed builds."
                },
                {
                  "summaryMessage": "Requires approvals",
                  "detailedMessage": "You still need 2 approvals before this pull request can be merged."
                },
                {
                  "summaryMessage": "Not all required reviewers have approved yet",
                  "detailedMessage": "At least 2 of the following users must review and approve this pull request before it can be merged: Alona Luchkovska, Carl Jensen, Ricardo Hernandez Lopez, Tadas Butkevičius, Omkar Joshi, Nicholas Rydje, Vladyslav Aleksholm, Philip Cheong."
                }
              ]
            }
          ]

        expect(pullRequest.waitingForBuild()).toBe(false);
    });

});

test('if pull request is out of date', () => {

    let pullRequest = new PullRequest(1)
    pullRequest.mergeVetoes = []

    expect(pullRequest.isOutOfDate()).toBe(false);
});