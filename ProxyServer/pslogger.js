/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 09:40
 * To change this template use File | Settings | File Templates.
 */
var redis = require('redis');
var http = require('http');
var url = require('url');
var fs = require( 'fs' );
var proxy, redisClient, redisDB = 15210;
var dbReadActivity = false, dbWriteActivity = false;
var dbOpened = false;

//
// Loggin and accounting
//
var enableLog = true, gLogLevel = 5;
var enableAccounting = true, gAccountingLevel = 5, accountingPrefix = 'NODE_MRU';
exports.debugLevel = 5, exports.verboseLevel = 6, exports.quietLevel = 1, exports.muteLevel = 0;
exports.msDBInactivityToWait = 1000;
exports.dbRActivity = 'DBR', exports.dbWActivity = 'DBW', exports.dbRWActivity = 'DBRW';

exports.setLoggingLevel = function ( logEnabled, logLevel) {
    enableLog = logEnabled;
    gLogLevel = logLevel;
}

exports.setAccountingLevel = function ( accEnabled, accLevel, accPrefix) {
    enableAccounting = accEnabled;
    gAccountingLevel = accLevel;
    accountingPrefix = accPrefix;
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

    if ((enableLog === true) && (fLogLevel <= gLogLevel)) {

        if ( isThereAnObjectToShow === true ) {
            console.log('** BEGIN ** ' + meaning + ' **');
            console.log(objectToShow);
            console.log('*** END *** ' + meaning + ' **');
        }
        else {
            console.log('** BEGIN ** ' + meaning + ' ** END **');
        }
    }
};

//
// Logs information to a redis database for accounting purposes
//
exports.accountingFunction = function (AccountingKey, accountingValue, fAccountingLevel) {
    if ((enableAccounting === true) && (fAccountingLevel <= gAccountingLevel)) {
        dbWriteActivity = true;
        redisClient.hmset(accountingPrefix+AccountingKey,accountingValue);
    }
};

exports.genAccountInformation = function (request) {
    var parsedURL = url.parse(request.url, true);
    //
    // Accounting information
    //
    dateNow= Date.now();

    var accountingInformation = {
        OriginHostIP: request.connection.remoteAddress.toString(),
        DestinationHost: parsedURL.host.toString(),
        DestinationPath: parsedURL.path.toString(),
        DestinationProtocol: parsedURL.protocol.toString(),
        Method: request.method.toString(),
        // DateEventmiliseconds: dateNow.toString(),
        dateEventHuman: Date(dateNow).toString()
    };

    exports.logFunction('AccountingInformation', accountingInformation, exports.verboseLevel);
    exports.logFunction('URL', parsedURL, exports.verboseLevel);
    exports.accountingFunction (dateNow.toString(), accountingInformation, exports.debugLevel);

}

//
// Print a URL after parsing it
//
exports.printURL = function (urlToPrint) {
    var parsedURL = url.parse(urlToPrint, true);
    exports.logFunction('URL', parsedURL, exports.quietLevel);
};

//
// Connect to a redis server and set te right database
//
var connectToDB = function () {

    redisClient = redis.createClient();

    redisClient.on("error", function (err) {
        exports.logFunction("Redis error", err, exports.quietLevel);
    });

    redisClient.on("end", function (err) {
        exports.logFunction("Redis end", exports.quietLevel);
    });

    // Select the redis Database
    redisClient.select(redisDB, function () { /* ... */ });
};

//
// Close the redis dabase in an ordered way
//
var closeDB = function (force) {
    if ( force === false ) {
        // Wait for ending replies
        redisClient.quit();
    }
    else {
        redisClient.end();
    }
};

var createOutputFile = function (fileName) {
    var opts = {
        flags: 'w',
        encoding: null,
        mode: 0644 };

    var fileStream;

    fileStream = fs.createWriteStream(fileName, opts);

    fileStream.on('end', function() {
        exports.logFunction('File closed', fileName, exports.verboseLevel);
    });
    fileStream.on('error', function(ex) {
        exports.logFunction('File error: '+ fileName, ex, exports.verboseLevel);
    });
    return (fileStream);
}

var closeOutputFile = function (fileStream) {
    try {
        fileStream.end();
    }
    catch (err) {
        exports.logFunction('Error closing Filestream', exports.quietLevel);
    }
}

var closeAndCallback = function (fileStream, callbackFunction, param1, param2, param3 )
{
    closeOutputFile(fileStream);

    callbackFunction (param1, param2, param3);
}

//
// Building on hmget redis key and the structure we dive and print data
//
var printKeyData = function (keyToPrint, structureToPrint, fileStream, HTMLFormat) {
    // Let's sort out the array to show the information that way
    structureToPrint.sort();

    // Still working
    dbReadActivity = true;

    // Data
    redisClient.hmget(keyToPrint, structureToPrint, function (err, d) {

        if (HTMLFormat === true) {
            fileStream.write('\tLI<B>Key: </B>'+ keyToPrint + '\n\tUL\n');
        }
        // print out the data
        structureToPrint.forEach(function (dataName, i) {
            if (HTMLFormat === true) {
                fileStream.write('\t\tLI<B>' + structureToPrint[i] + '</B>: ' + d[i] + '\n');
            }
            else {
                fileStream.write(keyToPrint + '.' + structureToPrint[i] + ': ' + d[i] + '\n');
            }
        });
        if (HTMLFormat === false) {
            fileStream.write('-----\n');
        }
    });
};

// Print Redis
exports.printHmsetKeys = function (pArgKey, pOutputFileName, pHTMLFormat, pHTMLheader, functionToCallBackWhenEnd ) {

    var internalKey = (typeof pArgKey === 'undefined') ? accountingPrefix : pArgKey;
    var vOutputFileName = (typeof pOutputFileName === 'undefined') ? 'stdout' : pOutputFileName;
    var internalHTMLFormat = (typeof pHTMLFormat === 'undefined') ? false : pHTMLFormat;
    var vHTMLheader = (typeof pHTMLheader === 'undefined') ? '' : pHTMLheader;
    var callbackFunction = (typeof functionToCallBackWhenEnd === 'undefined') ? function(){} : functionToCallBackWhenEnd;
    var fileStream; // File Stream

    if (vOutputFileName !== 'stdout') {
        fileStream = createOutputFile(vOutputFileName);
    }
    else {
        fileStream = process.stdout;
    }

    // Any main key
    redisClient.keys(internalKey + '*', function (err, listOfKeys) {

        if (err) return console.log(err);

        var dataStructure = [];

        fileStream.write(vHTMLheader);
        fileStream.write('OL\n');

        // We dive within the keys to know the structure
        listOfKeys.forEach (function ( lkElement, i ) {

            // Still working
            dbReadActivity = true;

            // We obtain the structure (not optimal, but generic)
            redisClient.hkeys(lkElement, function(err, replies) {

                dataStructure = [];

                // For each element we get the structure
                replies.forEach(function (reply, i) {
                    dataStructure.push(reply);
                });

                // Let's print everything
                printKeyData (lkElement, dataStructure, fileStream, internalHTMLFormat);
            });
        });
    });

    exports.callWhenNoDBActivity(exports.dbRActivity, closeAndCallback, fileStream, callbackFunction, pOutputFileName);
}

//
// Initilize (may ben not) the DB and maxTimeToWait
//
exports.init = function (initializeDB, timeToWaitForDB) {
    var internalDBInitialize = (typeof initializeDB === 'undefined') ? false : initializeDB;
    exports.msDBInactivityToWait = (typeof timeToWaitForDB === 'undefined') ? exports.msDBInactivityToWait : timeToWaitForDB;

    if ( internalDBInitialize === true) {
        connectToDB();
        dbOpened = true;
    }
}

exports.callWhenNoDBActivity = function (typeOfActivity, callbackFunction, cbParameter1, cbParameter2, cbParameter3) {
    var vTypeOfActivity = (typeof typeOfActivity === 'undefined') ? exports.dbRWActivity : typeOfActivity;
    var vCBFunction = (typeof callbackFunction === 'undefined') ? function(){} : callbackFunction;

    if (dbOpened === true) {
        dbReadActivity = dbWriteActivity = true;

        // Let's wait for a second before closing and ending
        setInterval(function () {

            if ( ((vTypeOfActivity === exports.dbRWActivity) && ( dbReadActivity === false ) && ( dbReadActivity === false )) ||
                ((vTypeOfActivity === exports.dbRActivity) && ( dbReadActivity === false )) ||
                ((vTypeOfActivity === exports.dbWActivity) && ( dbWriteActivity === false )) ) {

                clearInterval(this);
                exports.logFunction("Calling back a function when no DB activity", exports.verboseLevel);
                vCBFunction(cbParameter1, cbParameter2, cbParameter3);
            }
            dbReadActivity = dbWriteActivity = false;
        } , exports.msDBInactivityToWait);
    }
}

exports.end = function () {
    exports.callWhenNoDBActivity(exports.dbRWActivity, closeDB , false);
}
