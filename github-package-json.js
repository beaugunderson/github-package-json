'use strict';

var async = require('async');
var compact = require('lodash.compact');
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
  github.authenticate({
    type: 'token',
    token: process.env.GITHUB_TOKEN
  });
}

exports.master = function (repoish, cb) {
  var repo = githubToObject(repoish);

  github.repos.getContent({
    user: repo.user,
    repo: repo.repo,
    path: 'package.json'
  }, function (err, data) {
    if (err || !data.content) {
      return cb(err);
    }

    cb(null, new Buffer(data.content, 'base64').toString('utf8'));
  });
};

exports.pullRequests = function (repoish, cb) {
  var repo = githubToObject(repoish);

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

          cbMap(null, {
            number: pullRequest.number,
            url: pullRequest.url,
            json: body
          });
        });
      });
    }, function (err, results) {
      cb(err, compact(results));
    });
  });
};
