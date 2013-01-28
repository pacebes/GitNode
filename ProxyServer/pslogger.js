/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 09:40
 * To change this template use File | Settings | File Templates.
 */
var http = require('http');
var url = require('url');
var fs = require( 'fs' );

//
// Loggin
//
var enableLog = true, gLogLevel = 5;
exports.debugLevel = 5, exports.verboseLevel = 6, exports.quietLevel = 1, exports.muteLevel = 0;

exports.setLoggingLevel = function ( logEnabled, logLevel) {
    enableLog = logEnabled;
    gLogLevel = logLevel;
}

exports.timeStamp = function() {
    return(Date.now());
}

exports.humanTimeStamp = function() {
    return (Date(exports.timeStamp()).toString());
}

//
// Function for login purposes only
//
exports.logFunction = function (meaning, objectToShow, fLogLevel) {

    var isThereAnObjectToShow;

    if (typeof fLogLevel === 'undefined') {
        // only two paramaters were passed, so web have to rerder
        fLogLevel = objectToShow;

        // No objectToShow
        isThereAnObjectToShow = false;
    }
    else {
        isThereAnObjectToShow= true;
    }

    // If not logLevel let's say it is verbose
    fLogLevel = (typeof fLogLevel === 'undefined') ? exports.verboseLevel : fLogLevel;

    if ((enableLog === true) && (fLogLevel <= gLogLevel)) {

        if ( isThereAnObjectToShow === true ) {
            console.log('** BEGIN ** ' + meaning + ' ** ' + exports.humanTimeStamp());
            console.log(objectToShow);
            console.log('*** END *** ' + meaning + ' ** ' + exports.humanTimeStamp());
        }
        else {
            console.log(meaning +  ' (' + exports.humanTimeStamp() + ')');
        }
    }
};

//
// Print a URL after parsing it
//
exports.printURL = function (urlToPrint) {
    var parsedURL = url.parse(urlToPrint, true);
    exports.logFunction('URL', parsedURL, exports.quietLevel);
};


// Initilize (may ben not) the DB and maxTimeToWait
//
exports.init = function () {

}

// Initilize (may ben not) the DB and maxTimeToWait
//
exports.end = function () {

}