/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 28/01/13
 * Time: 11:19
 * To change this template use File | Settings | File Templates.
 */

var cluster = require('cluster');
var http = require('http');
var url = require('url');
var domain = require('domain');
var os = require('os');
var util = require('util');
var fs = require('fs');
var sys = require('sys')
var childp = require('child_process');
var logger = require('./psLogger.js');
var acc = require('./psAccounting');
var auth = require("./psProxyAuth.js");
var numCPUs = os.cpus().length;
var rssWarn = (50 * 1024 * 1024), heapWarn = (50 * 1024 * 1024);
var reportingPeriod = 30000;
var workers = {};

var sendProcessMessage = function(request) {
    // Save information
    process.send({cmd: "account", url: request.url, userIP: request.connection.remoteAddress,
        method: request.method });
}

var sendRedisMessage = function(request) {

    var messageToSend = {cmd: "account", url: request.url, userIP: request.connection.remoteAddress, method: request.method };
    acc.sendMessage(acc.accountingChannel, JSON.stringify(messageToSend));
}

var getLinuxCPUUsage = function(cb){

    var procFile= "/proc/" + process.pid + "/stat";

    logger.logFunction('Reading the process file: ' + procFile, logger.quietLevel);

    fs.readFile("/proc/" + process.pid + "/stat", function(err, data){
        if (err) {
            logger.logFunction('Error reading /proc file', err, logger.quietLevel);
            return;
        }

        console.log('-----', data);

        var elems = data.toString().split(' ');
        var utime = parseInt(elems[13]);
        var stime = parseInt(elems[14]);

        cb(utime + stime);
    });
}

var logMacCPUUsage = function () {

    //
    childp.exec('ps -o "pid,===,%cpu" -p 21514,37966', function (error, stdout, stderr) {
        sys.print('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
        else
            console.log(stdout);
    });
}

var logLinuxCPUUsage = function () {

     setInterval(function(){
            getLinuxCPUUsage(function(startTime){
                setTimeout(function(){
                    getLinuxCPUUsage(function(endTime){
                        var delta = endTime - startTime;
                        // On POSIX systems, there are 10000 ticks per second (per processor)
                        var percentage = 100 * (delta / 10000);

                        console.log('CPU usage: ', percentage);
                    });
                }, 1000);
            });
        }, reportingPeriod);
}

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
        logger.logFunction('MainProxyServer server got SIGCHLD', logger.quietLevel);
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
}


var childProcess_on = function () {

    process.on('error', function (err) {
        logger.logFunction('ProxyServer process error: ' + err, logger.quietLevel);
    });
/*
    process.on('uncaughtException', function (err) {
        logger.logFunction('ProxyServer process caught exception: ' + err, logger.quietLevel);
    });
*/
    process.on('exit', function () {
        logger.logFunction('ProxyServer process received exit', logger.quietLevel);
    });

    // Just for enjoying: some process control
    process.on('SIGTSTP', function () {
        logger.logFunction('Proxy server got SIGTSTP. Please press Control-C', logger.quietLevel);
    });

    process.on('SIGCHLD', function () {
        logger.logFunction('Proxy server got SIGCHLD', logger.quietLevel);
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
}



var processWorkerMessages = function(message)
{
    if (typeof(message) === 'undefined') {
        logger.logFunction('Received an undefined message from a worker', logger.quietLevel);
        return;
    }

    logger.logFunction('processWorkerMessages Message', message, logger.verboseLevel);

    switch (message.cmd) {
        case "reportMem":
            if(message.memory.rss > rssWarn) {
                logger.logFunction('Worker ' + message.process + ' using too much memory.', logger.quietLevel);
            }

            logger.logFunction('Worker ' + message.process +
                ' RSSmem: ' + message.memory.rss + ' (' + (message.memory.rss - workers[message.process].lastMemory.rss) + ')' +
                ' heapTot: ' + message.memory.heapTotal + ' (' + (message.memory.heapTotal - workers[message.process].lastMemory.heapTotal) + ')' +
                ' heapUsed: ' + message.memory.heapUsed + ' (' + (message.memory.heapUsed - workers[message.process].lastMemory.heapUsed) + ')',
                logger.quietLevel);

            workers[message.process].lastMemory =  {rss: message.memory.rss,heapTotal: message.memory.heapTotal,
                heapUsed: message.memory.heapUsed};

            break;

        case "account":
            logger.logFunction('Forwarding account message to parent', logger.verboseLevel);
            // Let's forward the message to the parent
            process.send(message);
            break

        case "ready":
            logger.logFunction('Forwarding ready message to parent', logger.verboseLevel);
            // Let's forward the message to the parent
            process.send(message);
            break

        default:
            logger.logFunction('Cluster master: received an unknown message', logger.quietLevel);
            break;
    }
}

var beAServer = function (proxyServerPort, proxyServerIP) {

    var counterToShareMessages = 0;

    // DB initialization
    acc.init (true);
    acc.initProducer ();
    childProcess_on();
    //
    // Web server
    //
    http.createServer(function(request, response) {

        if ( auth.checkProxyRequest(request, response) === false) {
            return;
        }

        // Sharing ways to send messages
        counterToShareMessages += 1;

        if ( (counterToShareMessages % 2) === 0 ) {
            sendProcessMessage(request);
        }
        else {
            sendRedisMessage(request);
        }

        var parsedURL = url.parse(request.url, true);
        var opts = {
            host: parsedURL.host,
            protocol: parsedURL.protocol,
            port: parsedURL.port,
            path: parsedURL.path,
            method: request.method,
            headers: request.headers,
        };
        //
        // Exception control in the access to origin through domains
        //
        var proxy_request;
        // create a domain for proxy-to-origin client
        var proxyToOriginDomain = domain.create();

        proxyToOriginDomain.run(function() {
            logger.logFunction('Lets open an httpRequest to' + opts, logger.verboseLevel);
            proxy_request = http.request(opts);
        });

        // Proxy to Origin Domain error control
        proxyToOriginDomain.on('error', function(er) {
            logger.logFunction('Caught error on proxyToOrigin domain! Method (' + proxy_request.method + ') ' +
                proxy_request._headers.host+proxy_request.path, logger.quietLevel);
            logger.logFunction('Error on proxyToOrigin domain', er, logger.verboseLevel);
        });

        //
        // Let's pipe both sides.
        //
        proxy_request.on('response', function (proxy_response) {
            //
            // NO 'Keep-Alive' Connection
            //
            proxy_response.headers.connection = 'close';

            logger.logFunction('Headers', JSON.stringify(proxy_response.headers), logger.verboseLevel);
            proxy_response.pipe(response);
            logger.logFunction('Piping webServer To client', logger.verboseLevel);
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
        });

        logger.logFunction('Piping client to webServer', logger.verboseLevel);
        request.pipe(proxy_request);

    }).listen(proxyServerPort, proxyServerIP);

    // We are ready to serve (message to Master)
    process.send({cmd: "ready", origin: "ProxyServer on port " + proxyServerPort + " IP " + proxyServerIP, pid: process.pid });

    logger.logFunction('Proxy server running on http://' + proxyServerIP + ':' + proxyServerPort + '/', logger.verboseLevel);


}

function createWorker() {
    var worker = cluster.fork()

    logger.logFunction('MainProxyServer: created worker: ' + worker.pid, logger.verboseLevel)

    workers[worker.process.pid] = {worker: worker, lastMemory: {rss: 0, heapTotal: 0, heapUsed: 0} };
    worker.on('message', processWorkerMessages);
}

var initProcess = function (port, ip) {

    if(cluster.isMaster) {
        logger.logFunction('Just out of curiosity. Number of CPUs: ' + os.cpus().length, logger.verboseLevel);
        logger.logFunction('Master cluster PID: ' + process.pid, logger.verboseLevel);

        masterProcess_on();

        cluster.on('death', function(worker) {
            logger.logFunction('Worker ' + worker.pid + ' died', logger.quietLevel);
        });

        for(var i=0; i< (numCPUs-1); i++) {
            createWorker();
        }

        // We are ready to serve (message to Master)
        process.send({cmd: "ready", origin: "Proxy Cluster", pid: process.pid });
    }
    else {

        logger.logFunction("Let's create a server on port " + port + ', IP ' + ip, logger.verboseLevel);
        beAServer(port, ip);

        setInterval(function report(){
            process.send({cmd: "reportMem", memory: process.memoryUsage(), process: process.pid});
        }, reportingPeriod)


    }
}

// print process.argv
process.argv.forEach(function (val, index, array) {
    logger.logFunction('Parameter ' + index + ': ' + val, logger.verboseLevel);
});

initProcess(process.argv[2],process.argv[3]);
