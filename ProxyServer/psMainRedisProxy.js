/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 28/01/13
 * Time: 15:33
 * To change this template use File | Settings | File Templates.
 */
var posix = require ('posix');
var logger = require('./psLogger.js');
var acc = require('./psAccounting.js');
var timePeriodToCheckParentDeath = 3000;

//
// Messages from the Master
//
var processMasterMessage = function (message) {

    if (typeof(message) === 'undefined') {
        logger.logFunction('AccServer children received a no message', logger.quietLevel);
        return;
    }

    switch (message.cmd) {
        case 'init':
            logger.logFunction('AccServer children received the init message', message , logger.verboseLevel);
            break;

        case 'account':
            logger.logFunction('AccServer children received the account message', message , logger.verboseLevel);
            acc.saveProxyInformation(message.url, message.userIP, message.method);
            break;

        default:
            logger.logFunction('AccServer children: received an unknown message', message, logger.quietLevel);
            break;
    }
}

var processRedisChannelMessage = function (channel, message) {

    var jsonMessage;
    logger.logFunction('AccServer children received the Redis message "' + message + '" on the channel ' + channel,
        logger.verboseLevel);

    jsonMessage = JSON.parse(message);
    if (jsonMessage) {
        acc.saveProxyInformation(jsonMessage.url, jsonMessage.userIP, jsonMessage.method);
    }
    else {
        logger.logFunction('AccServer children: cannot convert to JSON the message: ', message, logger.quietLevel);
    }

}

var checkParentDeath = function() {
    var ppid = posix.getppid();

    if ( ppid === 0 ) {
        logger.logFunction('AccServer parent is dead', logger.quietLevel);
        endProcess();
        exit(1);
    }
}

var process_on = function () {

    // Process messages from the Master
    process.on('message', processMasterMessage);

    process.on('error', function (err) {
        logger.logFunction('AccServer process error: ' + err, logger.quietLevel);
    });

    process.on('uncaughtException', function (err) {
        logger.logFunction('AccServer process caught exception: ' + err, logger.quietLevel);
    });

    process.on('exit', function () {
        logger.logFunction('AccServer process received exit', logger.quietLevel);
        endProcess();
    });

    process.on('SIGTSTP', function () {
        logger.logFunction('AccServer server got SIGTSTP. Please press Control-C', logger.quietLevel);
    });

    process.on('SIGINT', function () {
        logger.logFunction('AccServer server got SIGINT. Bye', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGKILL', function () {
        logger.logFunction('AccServer server server got SIGKILL. Bye', logger.quietLevel);
        process.exit(1);
    });

    process.on('SIGHUP', function () {
        logger.logFunction('AccServer server server got SIGHUP. Bye', logger.quietLevel);
        process.exit(1);
    });

    // Check parent death
    setInterval(checkParentDeath, timePeriodToCheckParentDeath);

}

var endProcess = function () {
    acc.end();
    acc.endConsumer();
}

var initProcess = function (textProcess) {

    // DB initialization
    acc.init (true);
    acc.initConsumer();
    acc.subscribeToChannel(acc.accountingChannel);
    acc.callMeOnMessage(processRedisChannelMessage);

    process_on();

    logger.logFunction (textProcess + ' (PID ' + process.pid + ') is ready to store Account information', logger.verboseLevel);

    // We are ready to serve (message to Master)
    process.send({cmd: "ready", origin: textProcess, pid: process.pid })
}

// print process.argv
process.argv.forEach(function (val, index, array) {
    logger.logFunction('Parameter ' + index + ': ' + val, logger.verboseLevel);
});


initProcess(process.argv[1]);
