/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 17:01
 * To change this template use File | Settings | File Templates.
 */
"use strict";

var logger = require('./psLogger.js');
var acc = require('./psAccounting.js');
var fs = require('fs');
var url = require('url');
var http = require('http');
var express = require('express');
var defaultAutoRefreshTime = 600, autoRegenerationTime = 10;
var outFileNamePrefix = './views/temporalJadeFile', outFileNameSuffix = '.txt',
    jadeRender = 'proxyUsage', jadeFileName = './views/' + jadeRender + '.jade';
var appExpress;
var jadeServerPort, jadeServerIP;
var serverExpress;
var httpSimpleServer;
var indexContent;



var giveMeJadeHeader = function (title, secondsAutoRefresh, urlToRefresh) {
    return (
        'title ' + title + '\n' +
            'head <meta http-equiv="refresh" content="' + secondsAutoRefresh + '; url=' + urlToRefresh + '">' + '\n' +
            'p<B>Proxy Usage page </B>(' + Date(Date.now()).toString() + ')\n' +
            "script(type='text/javascript')\n\tfunction myFunctionToRefresh()\n\t{\n\t" +
            'window.location="/regeneration/?time=now;"' +
            '\n\t}\n' +
            'button(enabled="enabled", onclick="myFunctionToRefresh()") Push to refresh\n\n'

        );
};

var callMeWhenDatafileReady = function (outputFileName) {
    fs.rename(outputFileName, jadeFileName, function (err) {

            logger.logFunction('File ready to be served: ' + outputFileName);
            if (typeof(pOutputFileName) !== 'undefined') {
                logger.logFunction('Error when renaming a file:', err, logger.debugLevel);
            }
        }
    );
};

// We assume the DB is already initialized
var generateBodyPart = function (secondsAutoRefresh, urlToRefresh) {

    // Let's generate the body data (UL + LI)
    acc.printHmsetKeys('NODE_MRU', outFileNamePrefix + Date.now() + outFileNameSuffix,
        true, giveMeJadeHeader('Welcome to Proxy Web Page Usage', secondsAutoRefresh, urlToRefresh), callMeWhenDatafileReady);

};

var reSendPageToUser = function (response, messageRedirect) {
    response.writeHead(200, {'Content-Type':'text/html'});
    response.end(messageRedirect);
};


var giveMeURLToRefresh = function () {

    var urlToRefresh = 'http://' + process.argv[3] + ':' + process.argv[2] + '/';
    return urlToRefresh;
};

var giveMeMessageRedirect = function () {

    var messageRedirect = '<meta http-equiv="refresh" content="0; url=' + giveMeURLToRefresh() + '">';
    return messageRedirect;
};

//
// Messages from the Master
//
var processMasterMessage = function (message) {

    if (typeof(message) === 'undefined') {
        return;
    }

    switch (message.cmd) {
        case 'init':
            logger.logFunction('AccView children received the init message', message, logger.verboseLevel);
            break;

        default:
            logger.logFunction('AccView children: received an unknown message', message, logger.quietLevel);
            break;
    }
};


var process_on = function () {

    // Process messages from the Master
    process.on('message', processMasterMessage);

    process.on('error', function (err) {
        logger.logFunction('AccView process error: ' + err, logger.quietLevel);
    });

    /*
     process.on('uncaughtException', function (err) {
     logger.logFunction('AccView process caught exception: ' + err, logger.quietLevel);
     });
     */

    process.on('exit', function () {
        logger.logFunction('AccView process received exit', logger.quietLevel);
    });

};

var webServerListenCallback = function () {
    logger.logFunction('Web server is ready to serve content on port ' + httpSimpleServer.address().port +
        ' IP ' + httpSimpleServer.address().address, logger.verboseLevel);

    if (typeof process.send === 'function') {
        // We are ready to serve (message to Master)
        process.send({cmd: "ready", origin: process.argv[1] + ' on port ' + httpSimpleServer.address().port +
            ' IP ' + httpSimpleServer.address().address, pid: process.pid });
    }

};


var createASimpleWebServer = function (port, hostName) {

    var requestNumber = 0;

    httpSimpleServer = http.createServer(function (req, res) {
        var parsedURL = url.parse(req.url, true);
        if (parsedURL.path.indexOf('regeneration') > -1) {
            logger.logFunction('Proxy log page regeneration', logger.quietLevel);
            generateBodyPart(defaultAutoRefreshTime, giveMeURLToRefresh());

            setTimeout(getJadeBody, 1000 * autoRegenerationTime, jadeServerPort, jadeServerIP);
            setTimeout(reSendPageToUser, 1000 * (autoRegenerationTime + 1), res, giveMeMessageRedirect());

            logger.logFunction('MainAccView Regeneration ' + parsedURL.path, logger.verboseLevel);
        }
        else {
            requestNumber += 1;
            if ((requestNumber % 10) === 0) {
                logger.logFunction('MainAccView request served: ' + requestNumber, logger.quietLevel);
                logger.logFunction('MainAccView request served: ', parsedURL, logger.verboseLevel);
            }

            res.writeHead(200, {'Content-Type':'text/html'});
            res.end(indexContent);
        }
    }).listen(port, hostName, webServerListenCallback);

    httpSimpleServer.on('error', function (er) {
        logger.logFunction('MainAccView web server error', er, logger.quietLevel);
    });

};

var getJadeBody = function (port, IP, callbackFunction, param1, param2) {

    var callback,
        options = {
        host:IP,
        port:port,
        path:'/'
    };

    callback = function (response) {
        var str = '';

        response.on('data', function (chunk) {
            str += chunk;
        });

        response.on('end', function () {
            indexContent = str;
            logger.logFunction('Jade server page has been received', logger.verboseLevel);
            logger.logFunction('Jade server page content: ', indexContent, logger.verboseLevel);

            if (typeof callbackFunction === 'function') {
                callbackFunction(param1, param2);
            }
        });
    };

    http.request(options, callback).end();

};

var expressListenCallback = function () {

    jadeServerPort = serverExpress.address().port;
    jadeServerIP = serverExpress.address().address;

    logger.logFunction ('Express-Jade ' + process.argv[1] + ' is ready to serve content on port ' + jadeServerPort + ' IP '+ jadeServerIP,
        logger.quietLevel);

    getJadeBody(jadeServerPort, jadeServerIP, createASimpleWebServer, process.argv[2], process.argv[3]);

};

var initExpressProcess = function(jadeServerPort, jadeServerIP, textProcess) {

    // DB initialization
    acc.init (true);

    appExpress = express();
    appExpress.set('view engine', 'jade');
    serverExpress = http.createServer(appExpress);

    // Very First file
    generateBodyPart(defaultAutoRefreshTime, giveMeURLToRefresh());

    appExpress.get('/', function(req, res) {
        logger.logFunction('Express request received on "/"', logger.verboseLevel);
        res.render(jadeRender);
    });

    serverExpress.listen(jadeServerPort,jadeServerIP,expressListenCallback);
};


// print process.argv
process.argv.forEach(function (val, index, array) {
    logger.logFunction('Parameter ' + index + ': ' + val, logger.verboseLevel);
});

jadeServerIP = '127.0.0.1';
// Init the process
initExpressProcess(0, jadeServerIP, process.argv[1]);

process_on();

// Process parameters
logger.enableProcLogging(logger.defaultReportingPeriod, false, logger.quietLevel, 'LogAccessWeb ', true, true);
