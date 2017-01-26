var co        = require('co')
var forEach   = require('co-foreach');
var _         = require('lodash')
var string    = require('string')
var Promise   = require('bluebird');
var GitHubApi = require("github");
var slack     = require('slack')
var delay     = require('timeout-as-promise');

ORG = process.env.ORG
 
var github = new GitHubApi({
  debug: false,
  protocol: "https",
  host: "api.github.com",
  headers: { "user-agent": "Pull-Requests" },
  Promise: require('bluebird'),
  followRedirects: false,
  timeout: 5000
});

github.authenticate({
  type: "oauth",
  token: process.env.GITHUB_AUTH_TOKEN
});

function * loadPRS(owner) {
  const repos = yield github.repos.getForOrg({org: owner})

  let found_prs = {}
  console.log(`Found ${repos.length} repositories for ${owner}`)
  for (var repo of repos) {
    const prs = yield github.pullRequests.getAll({owner, repo: repo.name})
    console.log(`Found ${prs.length} pull requests for ${owner}/${repo.name}`)
    if (prs.length > 0) {
      found_prs[repo.name] = found_prs[repo.name] || []
      prs.forEach((pr) => found_prs[repo.name].push({ submitter: pr.user.login, number: pr.number, url: pr.url, url: pr.html_url, title: pr.title }))
    }
  }

  return found_prs
}

function countPRS(prs) {
  const counts = Object.keys(prs).map((repo) => prs[repo].length)
  const flatCounts = _.flatten(counts)
  const prCount = _.sum(flatCounts)
  return prCount
}

function makeAttachments(prs) {
  return prs.map((pr) => ({
    "fallback": pr.title,
    "color": "#36a64f",
    "title": pr.title,
    "title_link": pr.url,
    "text": `by ${pr.submitter}`, //`by <https://github.com/${pr.submitter}|${pr.submitter}>`,
    "ts": new Date().getTime()
  }))
}

function * sendMessage(org, repo, prs) {
  const attachments = makeAttachments(prs)
  const message = {
    "token": process.env.SLACK_TOKEN,
    "channel": process.env.SLACK_CHANNEL,
    "text": `There ${prs.length == 1 ? 'is' : 'are'} *${prs.length}* open pull ${prs.length == 1 ? 'request' : 'requests'} on *${repo}*.`, //<https://github.com/${org}/${repo}|${repo}>:`,
    "attachments": attachments
  }
  slack.chat.postMessage(message, (err, data) => { console.log(err, data) })      
}

co(function*() {
  const allPrs = yield loadPRS(ORG)
  for (var repo of Object.keys(allPrs)) {
    const prs = allPrs[repo]
    yield sendMessage(ORG, repo, prs)
  }
}).catch(function(err) {
  console.error(err.stack);
});