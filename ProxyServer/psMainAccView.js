/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 17:01
 * To change this template use File | Settings | File Templates.
 */
var logger = require('./psLogger.js');
var acc = require('./psAccounting.js');
var fs = require( 'fs' );
var express = require('express');
var app = express();
var defaultAutoRefreshTime=600, autoRegenerationTime=10;
var outFileNamePrefix = './views/temporalJadeFile',outFileNameSufix='.txt', jadeRender='proxyUsage',
    jadeFileName = './views/' + jadeRender + '.jade';
app.set('view engine', 'jade');

var giveMeJadeHeader =  function(title, secondsAutoRefresh, urlToRefresh){
    return(
        'title ' + title + '\n' +
        'head <meta http-equiv="refresh" content="'+secondsAutoRefresh+'; url=' + urlToRefresh + '">' + '\n' +
        'p<B>Proxy Usage page </B>('+ Date(Date.now()).toString() + ')\n' +
        "script(type='text/javascript')\n\tfunction myFunctionToRefresh()\n\t{\n\t" +
            'window.location="/regeneration/?time=now;"' +
            '\n\t}\n' +
        'button(enabled="enabled", onclick="myFunctionToRefresh()") Push to refresh\n\n'

    )
}

var callMeWhenDatafileReady = function (outputFileName) {
    fs.rename(outputFileName,jadeFileName, function (err) {

            logger.logFunction('File ready to be served: ' + outputFileName);
            if (typeof pOutputFileName !== 'undefined') {
                logger.logFunction ('Error when renaming a file:', err, logger.debugLevel);
            }
        }
        );
}

// We assume the DB is already initialized
var generateBodyPart = function (secondsAutoRefresh, urlToRefresh) {

    // Let's generate the body data (UL + LI)
    acc.printHmsetKeys('NODE_MRU', outFileNamePrefix+Date.now()+outFileNameSufix,
        true, giveMeJadeHeader('Welcome to Proxy Web Page Usage',secondsAutoRefresh, urlToRefresh),callMeWhenDatafileReady);

}

var reSendPageToUser = function (response, messageRedirect)
{
    response.send(response, messageRedirect);
}


//
// Messages from the Master
//
var processMasterMessage = function (message) {

    if (typeof(message) === 'undefined') {
        return;
    }

    switch (message.cmd) {
        case 'init':
            logger.logFunction('AccView children received the init message', message , logger.verboseLevel);
            break;

        default:
            logger.logFunction('AccView children: received an unknown message', message, logger.quietLevel);
            break;
    }
}


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

}

var initProcess = function(jadeServerPort, jadeServerIP, textProcess) {

    // DB initialization
    acc.init (true);

    var urlToRefresh = 'http://' + jadeServerIP +':' + jadeServerPort + '/';
    var messageRedirect ='<meta http-equiv="refresh" content="0; url=' + urlToRefresh + '">';

    process_on();

    // Very First file
    generateBodyPart(defaultAutoRefreshTime, urlToRefresh);

    app.get('/', function(req, res) {
        res.render(jadeRender);
    });

    app.get('/regeneration/*', function(req, res) {

        generateBodyPart(defaultAutoRefreshTime,urlToRefresh);
        setTimeout(reSendPageToUser, 1000 * autoRegenerationTime, res, messageRedirect);
        logger.logFunction ('Proxy log page regeneration', logger.verboseLevel);
    });

    app.listen(jadeServerPort,jadeServerIP);

    logger.logFunction (textProcess + ' is ready to serve content', logger.verboseLevel);

    // Process parameters
    logger.enableProcLogging(logger.defaultReportingPeriod, false, logger.quietLevel, 'LogAccessWeb ', true, true);

    if (typeof process.send === 'function') {
        // We are ready to serve (message to Master)
        process.send({cmd: "ready", origin: textProcess, pid: process.pid })
    }

}

// print process.argv
process.argv.forEach(function (val, index, array) {
    logger.logFunction('Parameter ' + index + ': ' + val, logger.verboseLevel);
});


// Init the process
initProcess(process.argv[2], process.argv[3], process.argv[1]);
