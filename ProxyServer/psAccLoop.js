/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 28/01/13
 * Time: 15:33
 * To change this template use File | Settings | File Templates.
 */
var logger = require('./psLogger.js');
var acc = require('./psAccounting.js');

//
// Messages from the Master
//
var processMasterMessage = function (message) {

    if (typeof(message) === 'undefined') {
        logger.logFunction('AccLoop children received a no message', logger.quietLevel);
        return;
    }

    switch (message.cmd) {
        case 'init':
            logger.logFunction('AccLoop children received the init message', message , logger.verboseLevel);
            break;

        case 'account':
            logger.logFunction('AccLoop children received the account message', message , logger.verboseLevel);
            acc.saveProxyInformation(message.url, message.userIP, message.method);
            break;

        default:
            logger.logFunction('AccLoop children: received an unknown message', message, logger.quietLevel);
            break;
    }
}

var process_on = function () {

    // Process messages from the Master
    process.on('message', processMasterMessage);

    process.on('error', function (err) {
        logger.logFunction('AccLoop process error: ' + err, logger.quietLevel);
    });

    process.on('uncaughtException', function (err) {
        logger.logFunction('AccLoop process caught exception: ' + err, logger.quietLevel);
    });

    process.on('exit', function () {
        logger.logFunction('AccLoop process ends: ' + err, logger.quietLevel);
    });

}


exports.init = function(textProcess, idProcess) {

    // DB initialization
    acc.init (true);
    process_on();

    logger.logFunction (textProcess + ' (PID ' + process.pid + ') is ready to store Account information', logger.verboseLevel);

    // We are ready to serve (message to Master)
    process.send({cmd: "ready", origin: textProcess, pid: process.pid })
}