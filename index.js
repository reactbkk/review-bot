'use strict'

module.exports = function(ctx, cb) {
  const GitHubApi = require('github')
  const co = require('co')

  const github = new GitHubApi({
    headers: { "user-agent": "React Bangkok Review Bot" },
    timeout: 10000
  })

  github.authenticate({
    type: "token",
    token: ctx.secrets.GH_TOKEN
  })

  const BUILD_FAILED = '✖︎ Build failed'
  const ISSUE_TAG_MISSING = '✖︎ Issue tag missing'
  const owner = 'reactbkk'
  const repo = '2.0.0'

  function main () {
    return co(function* () {
      const pulls = yield github.pullRequests.getAll({ owner: 'reactbkk', repo: '2.0.0' })
      for (const pull of pulls.data) {
        console.log(pull.number)
        yield * checkPullRequest(pull.number)
      }
    })
  }

  function createPoster (number) {
    const outbox = [ ]
    return {
      say (text) {
        outbox.push(text)
      },
      post () {
        if (outbox.length) {
          const body = outbox.join('\n')
          return github.issues.createComment({ owner, repo, number, body })
        }
        return Promise.resolve()
      }
    }
  }

  function * checkPullRequest (number) {
    const log = (text) => console.log(`[${number}] ${text}`)

    log('Fetching pull request data')
    const pull = yield github.pullRequests.get({ owner, repo, number })
    const labels = yield github.issues.getIssueLabels({ owner, repo, number })
    const statuses = yield github.repos.getStatuses({ owner, repo, ref: pull.data.head.sha })
    const poster = createPoster(number)
    const hasLabel = (name) => labels.data.filter(x => String(x.name) === String(name)).length > 0
    const reply = (text) => poster.say(`@${pull.data.user.login} ${text}`)
    const addLabel = (name) => {
      return github.issues.addLabels({ owner, repo, number, labels: [ name ] })
    }
    const removeLabel = (name) => {
      return github.issues.removeLabel({ owner, repo, number, name })
    }

    try {
      if (containsIssueTag(pull.data.body)) {
        log('Issue tag OK')
        if (hasLabel(ISSUE_TAG_MISSING)) {
          log('Remove label')
          yield removeLabel(ISSUE_TAG_MISSING)
          reply('I found an issue tag now, thank you.')
        }
      } else {
        log('No issue tag')
        if (!hasLabel(ISSUE_TAG_MISSING)) {
          log('Add label')
          yield addLabel(ISSUE_TAG_MISSING)
          reply([
            'Please **update the pull request description** (not the title) to include an issue tag:',
            '',
            '- If this pull request solves an issue, say `Close #xx` where `xx` is the issue number.',
            '- If this pull request not associated with any issue, say `No associated issue`.',
            '',
            'Thank you. I will confirm with you again once the problem is fixed.'
          ].join('\n'))
        }
      }
      const status = getCIStatus(statuses)
      if (status.state === 'success') {
        log('State success')
        if (hasLabel(BUILD_FAILED)) {
          log('Remove label')
          yield removeLabel(BUILD_FAILED)
          reply('CI build passed now. Thank you!')
        }
      } else if (status.state === 'failure' || status.state === 'error') {
        log('State ' + status.state)
        if (!hasLabel(BUILD_FAILED)) {
          log('Add label')
          yield addLabel(BUILD_FAILED)
          reply([
            'Sorry, the CI build failed. We cannot merge your pull request if CI build is not passing.',
            '',
            `Please [check the CI build log](${status.target_url}) for more information.`
          ].join('\n'))
        }
      }
    } finally {
      yield poster.post()
    }
  }

  function containsIssueTag (text) {
    return /(close|improve)(s)?\s*#\d+|no( associated)? issue/i.test(text)
  }

  function getCIStatus (statuses) {
    const found = statuses.data.filter(s => s.context === 'ci/circleci')[0]
    if (!found) return { state: 'pending' }
    return found
  }

  main().then(x => cb(null, x), e => cb(e))
}
