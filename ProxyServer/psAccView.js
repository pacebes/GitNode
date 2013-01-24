/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 17:01
 * To change this template use File | Settings | File Templates.
 */
var logger = require('./pslogger.js');
var express = require('express');
var fs = require( 'fs' );
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

            if (typeof pOutputFileName !== 'undefined') {
                logger.logFunction ('Error when renaming a file:', err, exports.debugLevel);
            }
        }
        );
}

// We assume the DB is already initialized
var generateBodyPart = function (secondsAutoRefresh, urlToRefresh) {

    // Let's generate the body data (UL + LI)
    logger.printHmsetKeys('NODE_MRU', outFileNamePrefix+Date.now()+outFileNameSufix,
        true, giveMeJadeHeader('Welcome to Proxy Web Page Usage',secondsAutoRefresh, urlToRefresh),callMeWhenDatafileReady);

}

var reSendPageToUser = function (response, messageRedirect)
{
    response.send(response, messageRedirect);
}


exports.runJadeServer = function(jadeServerPort, jadeServerIP) {

    var urlToRefresh = 'http://' + jadeServerIP +':' + jadeServerPort + '/';
    var messageRedirect ='<meta http-equiv="refresh" content="0; url=' + urlToRefresh + '">';
    // Very First file
    generateBodyPart(defaultAutoRefreshTime, urlToRefresh);

    app.get('/', function(req, res) {
        res.render(jadeRender);
    });


    app.get('/regeneration/*', function(req, res) {

        generateBodyPart(defaultAutoRefreshTime,urlToRefresh);
        setTimeout(reSendPageToUser, 1000 * autoRegenerationTime, res, messageRedirect);
        logger.logFunction ('Proxy log page regeneration', exports.verboseLevel);
    });

    app.listen(jadeServerPort,jadeServerIP);

}