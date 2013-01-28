/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 28/01/13
 * Time: 15:21
 * To change this template use File | Settings | File Templates.
 */
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
var fs = require('fs');
var logger = require('./psLogger')
var redisClient, redisDB = 15210;
var dbReadActivity = false, dbWriteActivity = false, dbRedisInternalCall = false;
var dbOpened = false;


//
// Loggin and accounting
//
var enableAccounting = true, gAccountingLevel = 5, accountingPrefix = 'NODE_MRU';
exports.debugLevel = 5, exports.verboseLevel = 6, exports.quietLevel = 1, exports.muteLevel = 0;
exports.dbRActivity = 'DBR', exports.dbWActivity = 'DBW', exports.dbRWActivity = 'DBRW';
exports.msDBInactivityToWait = 1000;


exports.setAccountingLevel = function ( accEnabled, accLevel, accPrefix) {
    enableAccounting = accEnabled;
    gAccountingLevel = accLevel;
    accountingPrefix = accPrefix;
}

//
// Logs information to a redis database for accounting purposes
//
accountingFunction = function (AccountingKey, accountingValue, fAccountingLevel) {
    logger.logFunction('Accounting Function hmset called with level', fAccountingLevel, logger.verboseLevel);

    if ((enableAccounting === true) && (fAccountingLevel <= gAccountingLevel)) {
        dbWriteActivity = true;
        dbRedisInternalCall = true;
        redisClient.hmset(accountingPrefix+AccountingKey,accountingValue);
        dbRedisInternalCall = false;
    }
};

//
// Connect to a redis server and set te right database
//
var connectToDB = function () {

    redisClient = redis.createClient();

    redisClient.on("error", function (err) {
        logger.logFunction("Redis error", err, logger.quietLevel);
    });

    redisClient.on("end", function (err) {
        logger.logFunction("Redis end", logger.quietLevel);
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
        logger.logFunction('File closed', fileName, logger.verboseLevel);
    });
    fileStream.on('error', function(ex) {
        logger.logFunction('File error: '+ fileName, ex, logger.verboseLevel);
    });
    return (fileStream);
}

var closeOutputFile = function (fileStream) {
    try {
        fileStream.end();
    }
    catch (err) {
        logger.logFunction('Error closing Filestream', logger.quietLevel);
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
var printKeyData = function (keyToPrint, structureToPrint, fileStream, HTMLFormat, callbackFunction, parameter) {
    // Let's sort out the array to show the information that way
    structureToPrint.sort();

    // Still working
    dbReadActivity = true;
    dbRedisInternalCall = true;
    // Data
    redisClient.hmget(keyToPrint, structureToPrint, function (err, d) {
        dbReadActivity = true;
        dbRedisInternalCall = false;

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
        // When no data pending to write
        if (typeof callbackFunction !== 'undefined') {
            fileStream.once('drain', function () {
                callbackFunction(parameter);
            });
        }

    });
};


exports.saveProxyInformation = function (pUrl, pOriginIP, pMethod ) {
    var parsedURL = url.parse(pUrl, true);
    //
    // Accounting information
    //
    dateNow= Date.now();

    var accountingInformation = {
        OriginHostIP: pOriginIP.toString(),
        DestinationHost: parsedURL.host.toString(),
        DestinationPath: parsedURL.path.toString(),
        DestinationProtocol: parsedURL.protocol.toString(),
        Method: pMethod.toString(),
        // DateEventmiliseconds: dateNow.toString(),
        dateEventHuman: Date(dateNow).toString()
    };

    logger.logFunction('AccountingInformation', accountingInformation, logger.verboseLevel);
    logger.logFunction('URL', parsedURL, logger.verboseLevel);
    accountingFunction (dateNow.toString(), accountingInformation, exports.debugLevel);

}

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

    dbReadActivity = true;
    dbRedisInternalCall = true;
    // Any main key
    redisClient.keys(internalKey + '*', function (err, listOfKeys) {
        dbReadActivity = true;
        dbRedisInternalCall = false;

        if (err) return console.log(err);

        var dataStructure = [];

        fileStream.write(vHTMLheader);
        fileStream.write('OL\n');

        // If no data...
        if (listOfKeys.length === 0) {
            callbackFunction (pOutputFileName);
            return;
        }

        // We dive within the keys to know the structure
        listOfKeys.forEach (function ( lkElement, i ) {

            dbReadActivity = true;
            dbRedisInternalCall = true;

            // We obtain the structure (not optimal, but generic)
            redisClient.hkeys(lkElement, function(err, replies) {
                dbReadActivity = true;
                dbRedisInternalCall = false;

                dataStructure = [];

                // For each element we get the structure
                replies.forEach(function (reply, i) {
                    dataStructure.push(reply);
                });

                // The last one
                if ( i === (listOfKeys.length - 1)) {
                    printKeyData (lkElement, dataStructure, fileStream, internalHTMLFormat,callbackFunction, pOutputFileName );
                }
                else {
                    printKeyData (lkElement, dataStructure, fileStream, internalHTMLFormat);
                }
            });
        });
    });
}

//
// Initialize (may ben not) the DB and maxTimeToWait
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
            if ( (dbRedisInternalCall === false) &&
                (((vTypeOfActivity === exports.dbRWActivity) && ( dbReadActivity === false ) && ( dbReadActivity === false )) ||
                    ((vTypeOfActivity === exports.dbRActivity) && ( dbReadActivity === false )) ||
                    ((vTypeOfActivity === exports.dbWActivity) && ( dbWriteActivity === false )))
                ) {
                clearInterval(this);
                logger.logFunction("Calling back a function when no DB activity", logger.verboseLevel);
                vCBFunction(cbParameter1, cbParameter2, cbParameter3);
            }
            dbReadActivity = dbWriteActivity = false;
        } , exports.msDBInactivityToWait);
    }
}

exports.end = function () {
    exports.callWhenNoDBActivity(exports.dbRWActivity, closeDB , false);
}
