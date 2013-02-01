/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 28/01/13
 * Time: 11:19
 * To change this template use File | Settings | File Templates.
 */
"use strict";

var cluster = require('cluster');
var http = require('http');
var url = require('url');
var domain = require('domain');
var os = require('os');
var util = require('util');
var fs = require('fs');
var sys = require('sys');
var logger = require('./psLogger.js');
var acc = require('./psAccounting');
var auth = require("./psProxyAuth.js");
var numCPUs = os.cpus().length,
    rssWarn = (80 * 1024 * 1024), heapWarn = (80 * 1024 * 1024),
    reportingPeriod = 30000,
    psMaxConn = 500,
    workers = {},
    useRedisMessages = false;

var sendProcessMessage = function (request) {
    // Save information
    if (typeof process.send === 'function') {
        process.send({cmd:"account", url: request.url, userIP: request.connection.remoteAddress,
            method:request.method });
    }
};

var sendRedisMessage = function (request) {
    var messageToSend;

    if (useRedisMessages === true) {
        messageToSend = {cmd: "account", url: request.url, userIP: request.connection.remoteAddress, method: request.method };
        acc.sendMessage(acc.accountingChannel, JSON.stringify(messageToSend));
    }
    else {
        // We don't trust the redis API. It looks a bit unstable
        sendProcessMessage(request);
    }
};


var masterProcess_on = function () {

    process.on('error', function (err) {
        logger.logFunction('MainProxyServer process error: ' + err, logger.quietLevel);
    });

    process.on('uncaughtException', function (err) {
        logger.logFunction('MainProxyServer process caught exception: ' + err, logger.quietLevel);
    });

    process.on('exit', function () {
        logger.logFunction('MainProxyServer process received exit', logger.quietLevel);
    });

    // Just for enjoying: some process control
    process.on('SIGTSTP', function () {
        logger.logFunction('MainProxyServer server got SIGTSTP. Please press Control-C', logger.quietLevel);
    });

    process.on('SIGCHLD', function () {
        //
        // The way to get the CPU usage in a mac is through a unix command ("ps ..."
        // That means that whenever this command ends this function is called
        //
        // logger.logFunction('MainProxyServer server got SIGCHLD', logger.quietLevel);
    });

    process.on('SIGINT', function () {
        logger.logFunction('MainProxyServer server got SIGINT', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGKILL', function () {
        logger.logFunction('MainProxyServer server got SIGKILL', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGHUP', function () {
        logger.logFunction('MainProxyServer server got SIGHUP', logger.quietLevel);
        process.exit(1);
    });
};


var childProcess_on = function () {

    process.on('error', function (err) {
        logger.logFunction('ProxyServer process error: ' + err, logger.quietLevel);
    });

    process.on('uncaughtException', function (err) {
        logger.logFunction('ProxyServer process caught exception: ' + err, logger.quietLevel);
    });

    process.on('exit', function () {
        logger.logFunction('ProxyServer process received exit', logger.quietLevel);
    });

    // Just for enjoying: some process control
    process.on('SIGTSTP', function () {
        logger.logFunction('Proxy server got SIGTSTP. Please press Control-C', logger.quietLevel);
    });

    process.on('SIGINT', function () {
        logger.logFunction('Proxy server got SIGINT', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGKILL', function () {
        logger.logFunction('Proxy server got SIGKILL', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGHUP', function () {
        logger.logFunction('Proxy server got SIGHUP', logger.quietLevel);
        process.exit(1);
    });
};

var processWorkerMessages = function(message)
{
    if (typeof(message) === 'undefined') {
        logger.logFunction('Received an undefined message from a worker', logger.quietLevel);
        return;
    }

    logger.logFunction('processWorkerMessages Message', message, logger.verboseLevel);

    switch (message.cmd) {
        case "reportProcData":
            if(message.memory.rss > rssWarn) {
                logger.logFunction('Worker ' + message.process + ' using too much memory.', logger.verboseLevel);
            }
            if(message.memory.heapTotal > heapWarn) {
                logger.logFunction('Worker ' + message.process + ' using too much heapTotal.', logger.verboseLevel);
            }

            workers[message.process].lastMemory =  {rss: message.memory.rss,heapTotal: message.memory.heapTotal,
                heapUsed: message.memory.heapUsed};

            break;

        case "account":
            logger.logFunction('Forwarding account message to parent', logger.verboseLevel);
            // Let's forward the message to the parent
            if (typeof process.send === 'function') {
                process.send(message);
            }
            break;

        case "ready":
            logger.logFunction('Forwarding ready message to parent', logger.verboseLevel);
            // Let's forward the message to the parent
            if (typeof process.send === 'function') {
                process.send(message);
            }
            break;

        default:
            logger.logFunction('Cluster master: received an unknown message',message, logger.quietLevel);
            break;
    }
};

var beAServer = function (proxyServerPort, proxyServerIP) {

    var counterToShareMessages = 0,
        httpProxyServer;

    if (useRedisMessages === true) {
        // DB initialization
        acc.init(true);
        acc.initProducer();
    }

    childProcess_on();

    //
    // Web server
    //
    httpProxyServer = http.createServer(function (request, response) {
        if (auth.checkProxyRequest(request, response) === false) {
            return;
        }

        // Sharing ways to send messages
        counterToShareMessages += 1;

        if ((counterToShareMessages % 2) === 0) {
            sendProcessMessage(request);
        }
        else {
            sendRedisMessage(request);
        }

        var parsedURL = url.parse(request.url, true),
        opts = {
                host:parsedURL.host,
                hostname:parsedURL.hostname,
                protocol:parsedURL.protocol,
                port:parsedURL.port,
                path:parsedURL.path,
                method:request.method,
                headers:request.headers,
                closeIdleConnections:true
            };

        //
        // Exception control in the access to origin through domains
        //
        var proxy_request;

        proxy_request = http.request(opts);

        // Let's pipe both sides.
        //
        proxy_request.on('response', function (proxy_response) {
            logger.logFunction('Proxy http request to origin. Response received: ', proxy_response, logger.verboseLevel);
            //
            // NO 'Keep-Alive' Connection
            //
            proxy_response.headers.connection = 'close';
            proxy_response.pipe(response);
            response.writeHead(proxy_response.statusCode, proxy_response.headers);

            logger.logFunction('Headers', JSON.stringify(proxy_response.headers), logger.verboseLevel);
            logger.logFunction('Piping webServer To client', logger.verboseLevel);
        });


        // Control Error
        proxy_request.on('error', function (er) {
            logger.logFunction('Caught error on proxy_request method (' + proxy_request.method + ') ' +
                proxy_request._headers.host + proxy_request.path, logger.quietLevel);
            logger.logFunction('Error on proxy_request: ' + er.code, logger.quietLevel);
            logger.logFunction('Detailed error', er, logger.verboseLevel);
            //
            // We send an OK back and end the connection (optional
            //
            // response.end('Error');
        });

        logger.logFunction('Piping client to webServer', logger.verboseLevel);
        request.pipe(proxy_request);

        if ((counterToShareMessages % 500) === 0) {
            logger.logFunction('ProxyServer request number ' + counterToShareMessages, logger.quietLevel);
        }


    });

    logger.logFunction('Proxy worker. We limit the maximum number or requests to ' + psMaxConn, logger.quietLevel);

    // Let's limit the number of request
    httpProxyServer.maxConnections = psMaxConn;

    httpProxyServer.listen(proxyServerPort, proxyServerIP);

    if (typeof process.send === 'function') {
        // We are ready to serve (message to Master)
        process.send({cmd:"ready", origin:"ProxyServer on port " + proxyServerPort + " IP " + proxyServerIP, pid:process.pid });
    }

    logger.logFunction('Proxy server running on http://' + proxyServerIP + ':' + proxyServerPort + '/', logger.verboseLevel);

};

var createWorker = function () {
    var worker = cluster.fork();

    logger.logFunction('MainProxyServer: created worker: ' + worker.pid, logger.verboseLevel)

    workers[worker.process.pid] = {worker:worker, lastMemory:{rss:0, heapTotal:0, heapUsed:0} };
    worker.on('message', processWorkerMessages);
};

var initProcess = function (port, ip) {
    var i;

    if (cluster.isMaster) {
        logger.logFunction('Just out of curiosity. Number of CPUs: ' + os.cpus().length, logger.verboseLevel);
        logger.logFunction('Master cluster PID: ' + process.pid, logger.verboseLevel);

        masterProcess_on();

        cluster.on('death', function (worker) {
            logger.logFunction('Worker ' + worker.pid + ' died', logger.quietLevel);
        });

        for (i = 0; i < (numCPUs - 1); i++) {
            createWorker();
        }

        if (typeof process.send === 'function') {
            // We are ready to serve (message to Master)
            process.send({cmd:"ready", origin: "Proxy Cluster", pid: process.pid });
        }
        logger.enableProcLogging(reportingPeriod, false, logger.quietLevel, 'ProxyCluster ', true, true);

    }
    else {

        logger.logFunction("Let's create a proxy server on port " + port + ', IP ' + ip, logger.verboseLevel);

        beAServer(port, ip);

        logger.enableProcLogging(reportingPeriod, true, logger.quietLevel, 'Worker child ', true, true);

    }
};

// print process.argv
process.argv.forEach(function (val, index, array) {
    logger.logFunction('Parameter ' + index + ': ' + val, logger.verboseLevel);
});

// http.globalAgent.maxSockets = 20000;
initProcess(process.argv[2],process.argv[3]);
