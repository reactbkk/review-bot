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
            'Please **update the pull request description** to include an issue tag.',
            '',
            '- If this pull request solves an issue, say `Close #xx` where `xx` is the issue number.',
            '- If this pull request not associated with any issue, say `No associated issue`.',
            '',
            'Thank you.'
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

  main().then(x => cb(null, x), e => cb(e))
}
