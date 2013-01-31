"use strict";

var cluster = require('cluster');
var cp = require('child_process');
var logger = require('./psLogger.js');

// Server variables
var proxyIPtoListenOn = '127.0.0.1', proxyPortToListenOn = 3000;
var jadeServerIP='127.0.0.1', jadeServerPort = 8080;
var accessWebChild, redisProxyChild, mainProxyserver,
    accessWebJS ='./psMainAccView.js', redisProxyJS ='./psMainRedisProxy.js', mainProxyServerJS='./psMainProxyServer.js';
var childList =[];

// Check Arguments
var argv = require('optimist')
    .usage('Run a proxy Server.\nUsage: $0')
    .options({
        proxyServerPort : {
            demand : true,
            alias : 'pp',
            description : 'Define the port at which the proxy server will listen'
        },
        proxyServerIP : {
            demand : false,
            alias : 'pi',
            description :  'Define the port at which the proxy server will listen',
            default : proxyIPtoListenOn
        },
        webServerPort : {
            demand : false,
            alias : 'wp',
            description : 'Define the port at which the web server will listen',
            default: jadeServerPort
        },
        webServerIP : {
            demand : true,
            alias : 'wi',
            description :  'Define the port at which the web server will listen',
            default : jadeServerIP
        }
    }).argv;

// Gathered values
proxyIPtoListenOn = argv.proxyServerIP; proxyPortToListenOn = argv.proxyServerPort;
jadeServerIP = argv.webServerIP; jadeServerPort = argv.webServerPort;

var processMsgFromChildren = function(message) {

    if ( typeof(message) === 'undefined') {
        return;
    }

    switch (message.cmd) {

        case 'ready':
            logger.logFunction('Master: received a READY message from ' + message.origin + ' (PID ' + message.pid + ') ', logger.quietLevel);
            // We only add children for the time being.
            childList[childList.length] = {processDesc: message.origin, processPID:message.pid};
            break;

        case "account":
            logger.logFunction('Forwarding account message to the logger', logger.verboseLevel);
            // Let's forward the message to the parent
            redisProxyChild.send(message);
            break;

        case "ping":
            logger.logFunction('Ping received from ' + message.origin, logger.verboseLevel);
            // Let's forward the message to the parent
            break;

        default:
            logger.logFunction('Master: received an unknown message', message, logger.quietLevel);
            break;
    }
};

var process_on = function () {

    process.on('error', function (err) {
        logger.logFunction('MainProxyServer error: ' + err, logger.quietLevel);
    });

    process.on('uncaughtException', function (err) {
        logger.logFunction('MainProxyServer caught exception: ' + err, logger.quietLevel);
    });

    process.on('exit', function () {
        logger.logFunction('MainProxyServer received exit', logger.quietLevel);
    });

    process.on('SIGCHLD', function () {
        // external shell scripts generate a SIGCHLD when end executions
        // logger.logFunction('MainProxyServer got SIGCHLD', logger.quietLevel);
    });

    // Just for enjoying: some process control
    process.on('SIGTSTP', function () {
        logger.logFunction('MainProxyServer got SIGTSTP. Please press Control-C', logger.quietLevel);
    });

    process.on('SIGINT', function () {
        logger.logFunction('MainProxyServer got SIGINT', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGKILL', function () {
        logger.logFunction('MainProxyServer got SIGKILL', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGHUP', function () {
        logger.logFunction('MainProxyServer got SIGHUP', logger.quietLevel);
        process.exit(1);
    });
};


var createChildRedisProxy = function () {
    redisProxyChild = cp.fork(redisProxyJS);
    redisProxyChild.on('message', processMsgFromChildren);
};

var createChildWebAccServer = function (port, IP) {
    accessWebChild = cp.fork(accessWebJS, [port, IP]);
    accessWebChild.on('message', processMsgFromChildren);
};

var createChildProxyController = function (port, IP) {
    mainProxyserver = cp.fork(mainProxyServerJS, [port, IP]);
    mainProxyserver.on('message', processMsgFromChildren);
};

process_on();

createChildRedisProxy();
createChildWebAccServer(jadeServerPort, jadeServerIP);
createChildProxyController(proxyPortToListenOn, proxyIPtoListenOn);

logger.enableProcLogging(logger.defaultReportingPeriod, false, logger.quietLevel, 'RootProcess  ', true, true);

