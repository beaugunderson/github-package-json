'use strict';

var async = require('async');
var compact = require('lodash.compact');
var debugModule = require('debug');
var debug = debugModule('github-package-json');
var find = require('lodash.find');
var GitHub = require('github');
var githubToObject = require('github-url-to-object');
var request = require('request');

var github = new GitHub({
  version: '3.0.0',
  headers: {
    'user-agent': 'github-package-json'
  }
});

if (process.env.GITHUB_TOKEN) {
  debug('using github token from environment');

  github.authenticate({
    type: 'token',
    token: process.env.GITHUB_TOKEN
  });
}

exports.master = function (repoish, cb) {
  var repo = githubToObject(repoish);

  if (!repo || !repo.user || !repo.repo) {
    debug('unable to parse repoish "%s": %j', repoish, repo);

    return cb(new Error('no user in repo ' + JSON.stringify(repo, null, 2)));
  }

  var debugFn = debugModule('github-package-json:' + repo.user + '/' +
    repo.repo);

  debugFn('getting package.json');

  github.repos.getContent({
    user: repo.user,
    repo: repo.repo,
    path: 'package.json'
  }, function (err, data) {
    if (err || !data.content) {
      return cb(err);
    }

    debugFn('got package.json');

    cb(null, new Buffer(data.content, 'base64').toString('utf8'));
  });
};

exports.pullRequests = function (repoish, cb) {
  var repo = githubToObject(repoish);

  if (!repo || !repo.user || !repo.repo) {
    debug('unable to parse repoish "%s": %j', repoish, repo);

    return cb(new Error('no user in repo ' + JSON.stringify(repo, null, 2)));
  }

  var debugFn = debugModule('github-package-json:' + repo.user + '/' +
    repo.repo);

  debugFn('getting pull requests');

  github.pullRequests.getAll({
    user: repo.user,
    repo: repo.repo,
    state: 'open',
    per_page: '15',
    sort: 'created',
    direction: 'desc'
  }, function (pullRequestsError, pullRequests) {
    if (pullRequestsError || !pullRequests) {
      return cb(pullRequestsError);
    }

    debugFn('got %d pull requests, getting files', pullRequests.length);

    async.map(pullRequests, function (pullRequest, cbMap) {
      github.pullRequests.getFiles({
        user: repo.user,
        repo: repo.repo,
        number: pullRequest.number,
        per_page: '100'
      }, function (getFilesError, files) {
        if (getFilesError || !files) {
          return cbMap(getFilesError);
        }

        debugFn('got %d files for #%d', files.length, pullRequest.number);

        var file = find(files, {filename: 'package.json'});

        if (!file) {
          return cbMap();
        }

        request.get({
          url: file.raw_url,
          json: true
        }, function (rawError, response, body) {
          if (rawError || !body) {
            return cbMap();
          }

          debugFn('got raw data for %s #%d', body.name, pullRequest.number);

          cbMap(null, {
            number: pullRequest.number,
            url: pullRequest.html_url,
            json: body
          });
        });
      });
    }, function (err, results) {
      cb(err, compact(results));
    });
  });
};
