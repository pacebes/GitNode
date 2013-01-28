var cluster = require('cluster');
var os = require('os');
var logger = require('./psLogger.js');
var view = require('./psAccView.js');
var ps = require('./psProxyServer.js');
var psAccLoop = require('./psAccLoop.js');

// Server variables
var proxyIPtoListenOn = '127.0.0.1', proxyPortToListenOn = 3000;
var jadeServerIP='127.0.0.1', jadeServerPort = 8080;

// Check Arguments
var argv = require('optimist')
    .usage('Run a proxy Server.\nUsage: $0')
    .options({
        proxyServerPort : {
            demand : true,
            alias : 'p',
            description : 'Define the port at which the proxy server will listen'
        },
        proxyServerIP : {
            demand : false,
            alias : 'ip',
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

var accWorkerId = 1, redisWorkerId = 2, accWorkerDesc = "accWorker", redisWorkerDesc = "redisWorker";

var workers = {};
var workerPID = [];

var processMsgFromChildren = function(message) {

    if (typeof(message) === 'undefined') {
        return;
    }

    switch (message.cmd) {

        case 'ready':
            logger.logFunction('Master: received a ready message from ' + message.origin + ' (PID ' + message.pid + ') ', logger.quietLevel);
            break;

        default:
            logger.logFunction('Master: received an unknown message', logger.quietLevel);
            break;
    }
};

//
// Messages from the Master
//
var processChildrenMessages = function (message) {

    if (typeof(message) === 'undefined') {
        return;
    }

    logger.logFunction('processChildrenMessages. Message', message, logger.verboseLevel);

    switch (message.cmd) {
        case 'init':
            if (message.beYourself === accWorkerId) {
                logger.logFunction('Init as ' + accWorkerDesc + '(PID ' + process.pid + ')', logger.verboseLevel);

                // No need for a new call because we have received this init message
                process.removeListener('message', processChildrenMessages);

                view.init(jadeServerPort, jadeServerIP, accWorkerDesc, accWorkerId);

            }
            else if (message.beYourself === redisWorkerId) {
                logger.logFunction('Init as ' + redisWorkerDesc + '(PID ' + process.pid + ')', logger.verboseLevel);

                // No need for a new call because we have received this init message
                process.removeListener('message', processChildrenMessages);

                psAccLoop.init(redisWorkerDesc, redisWorkerId);
            }
            else {
                logger.logFunction('Children init message not understood: ' + message.beYourself, logger.quietLevel);
            }
            break;

        default:
            logger.logFunction('Children: received an unknown message', logger.quietLevel);
            break;
    }
}

var createWorker = function (definition, id) {

    var worker = cluster.fork()
    logger.logFunction('Created ' + definition + ' worker: ' + worker.process.pid, logger.verboseLevel);

    workers[worker.process.pid] = {worker: worker, name: definition, id: id};
    worker.on('message', processMsgFromChildren);

    return worker;
}

exports.init = function () {

    // Master
    if (cluster.isMaster) {
        var worker;

        logger.logFunction ('Just out of curiosity. Number of CPUs: ' + os.cpus().length, logger.verboseLevel);

        logger.logFunction('Master cluster PID: ' + process.pid, logger.verboseLevel);

        process.on('error', function (err) {
            logger.logFunction('Master Process error: ' + err, logger.quietLevel);
        });
/*
        process.on('uncaughtException', function (err) {
            logger.logFunction('Master Process Caught exception: ' + err, logger.quietLevel);
        });
*/

        process.on('message',processMsgFromChildren);

        worker = createWorker(accWorkerDesc, accWorkerId);
        workerPID[accWorkerId] = worker.process.pid;

        worker = createWorker(redisWorkerDesc, redisWorkerId);
        workerPID[redisWorkerId] = worker.process.pid;

        cluster.on('death', function(worker) {
            logger.logFunction('Worker ' + worker.pid + ' died', logger.quietLevel);
        });

        workers[workerPID[accWorkerId]].worker.send({cmd: "init", beYourself: accWorkerId });
        workers[workerPID[redisWorkerId]].worker.send({cmd: "init", beYourself: redisWorkerId });

        ps.init(proxyPortToListenOn, proxyIPtoListenOn, workers[workerPID[redisWorkerId]].worker );
    }
    else {
       process.on('message', processChildrenMessages);
    }
}

