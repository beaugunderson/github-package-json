'use strict';

var async = require('async');
var compact = require('lodash.compact');
var find = require('lodash.find');
var GitHub = require('github');
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

exports.master = function (user, repo, cb) {
  github.repos.getContent({
    user: user,
    repo: repo,
    path: 'package.json'
  }, function (err, data) {
    if (err || !data.content) {
      return cb(err);
    }

    cb(null, new Buffer(data.content, 'base64').toString('utf8'));
  });
};

exports.pullRequests = function (user, repo, cb) {
  github.pullRequests.getAll({
    user: user,
    repo: repo,
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
        user: user,
        repo: repo,
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

exports.pullRequests('kriskowal', 'q', function (err, data) {
  console.log('error', err);
  console.log(data);
});
