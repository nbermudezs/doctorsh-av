var crypto = require('crypto');
var express = require('express');
var md5 = require('locutus/php/strings/md5');
var request = require('request');
var router = express.Router();

var API_URL = process.env.API_URL;
var API_KEY = process.env.API_KEY;
var ACCOUNT_NAME = process.env.ACCOUNT_NAME;
var TEMP_PASSWORD = process.env.TEMP_PASSWORD;
var APP_NAME = process.env.APP_NAME;

var httpRequest = function(url, args, cb) {
    args = args || {};
    parameters = 'account_name=' + ACCOUNT_NAME +
        '&api_key=' + API_KEY +
        '&application_name=' + APP_NAME
    Object.keys(args).map(function(key) {
        parameters = parameters +
            '&' + key + '=' + args[key];
    });
    return request.get({
        url: API_URL + url + '?' + parameters
    }, cb);
};

var generateUsername = function(size) {
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for( var i = 0; i < size; i++ ) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
};

var createUser = function(displayName, cb) {
    var username = generateUsername(10);
    httpRequest('AddUser/', {
        user_name: username,
        user_display_name: displayName,
        user_password: TEMP_PASSWORD
    }, function(_, httpResponse, resp) {
        cb && cb(null, {
            api_result: JSON.parse(resp),
            username: username
        });
    });
};

var bindUser = function(username, cb) {
    httpRequest('BindUser/', {
        user_name: username
    }, function(_, _, resp) {
        console.log('bindUser Response', resp);
        cb && cb(null, {
            api_result: JSON.parse(resp),
            username: username
        });
    });
};

var initUser = function(displayName, cb) {
    createUser(displayName, function(error, resp) {
        if (error) {
            return cb(error);
        }

        if (resp && resp.api_result.result === 1) {
            bindUser(resp.username, function(error, bindResponse) {
                if (!error && bindResponse && bindResponse.api_result.result === 1) {
                    cb(null, {
                        result: 'SUCCESS',
                        username: bindResponse.username
                    });
                } else {
                    cb('ERROR');
                }
            });

        } else {
            cb('ERROR');
        }
    });
};

var calculateHash = function(key, username) {
    return md5(key + '|' + md5(username + ':voximplant.com:' + TEMP_PASSWORD));
};

router.get('/joinConference', function(req, res, next) {
    var displayName = req.query.displayName;
    initUser(displayName, function(err, resp) {
        res.json(resp);
    });
});

router.get('/getOneTimeKey', function(req, res, next) {
    res.end(calculateHash(req.query.key, req.query.username));
});


module.exports = router;
