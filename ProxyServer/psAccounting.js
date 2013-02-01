/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 09:40
 * To change this template use File | Settings | File Templates.
 */
"use strict";

var redis = require('redis');
var http = require('http');
var url = require('url');
var fs = require('fs');
var bw = require("buffered-writer");
var logger = require('./psLogger')
var redisClient, redisConsumer, redisProducer, redisDB = 15210;
var dbReadActivity = false, dbWriteActivity = false, dbRedisInternalCall = false;
var dbOpened = false;
var enableAccounting = true, gAccountingLevel = 5, accountingPrefix = 'NODE_MRU';


//
// Logging and accounting
//
exports.debugLevel = 5;
exports.verboseLevel = 6;
exports.quietLevel = 1;
exports.muteLevel = 0;
exports.dbRActivity = 'DBR';
exports.dbWActivity = 'DBW';
exports.dbRWActivity = 'DBRW';
exports.msDBInactivityToWait = 1000;
exports.maxKeysToProcess = 100;
exports.accountingChannel = 'Accounting saving Channel';


exports.setAccountingLevel = function (accEnabled, accLevel, accPrefix) {
    enableAccounting = accEnabled;
    gAccountingLevel = accLevel;
    accountingPrefix = accPrefix;
};

//
// Logs information to a redis database for accounting purposes
//
var accountingFunction = function (AccountingKey, accountingValue, fAccountingLevel) {
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
        logger.logFunction("Redis end", logger.verboseLevel);
    });

    // Select the redis Database
    redisClient.select(redisDB, function () { /* ... */ });
};

//
// Close the redis database in an ordered way
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

    var fileStream;

    // fileStream = fs.createWriteStream(fileName, { flags: 'w', encoding: null, mode: 0644 });
    fileStream = bw.open(fileName, { bufferSize: 32 * 1024, encoding: 'utf8', append:false, mode: parseInt('644',8) , start: 0 })

    fileStream.on('end', function () {
        logger.logFunction('File closed', fileName, logger.verboseLevel);
    });

    fileStream.on('error', function (ex) {
        logger.logFunction('File error: ' + fileName, ex, logger.verboseLevel);
    });
    return (fileStream);

};

//
// Building on hmget redis key and the structure we dive and print data
//
var printKeyData = function (keyToPrint, structureToPrint, fileStream, HTMLFormat, callbackFunction, outputFileName) {
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
        if (typeof(callbackFunction) !== 'undefined') {

            if (outputFileName !== 'stdout') {
                fileStream.close( function () { callbackFunction(outputFileName); });
            }
            else {
                callbackFunction(outputFileName);
            }
        }
    });
};

var printDataStructure = function (key, fileStream, internalHTMLFormat, callbackFunction, pOutputFileName) {

    dbReadActivity = true;
    dbRedisInternalCall = true;

    // We obtain the structure (not optimal, but generic)
    redisClient.hkeys(key, function (err, replies) {
        dbReadActivity = true;
        dbRedisInternalCall = false;
        var iDataStructure = [];

        // For each element we get the structure
        replies.forEach(function (reply, i) {
            iDataStructure.push(reply);
        });
        printKeyData(key, iDataStructure, fileStream, internalHTMLFormat, callbackFunction, pOutputFileName);
        logger.logFunction('AccountingInformation: processing Key: ' + key, logger.verboseLevel);

    });
};

exports.saveProxyInformation = function (pUrl, pOriginIP, pMethod) {
    var parsedURL = url.parse(pUrl, true),
        dateNow = Date.now(),
        accountingInformation = {
            OriginHostIP: pOriginIP.toString(),
            DestinationHost: parsedURL.host.toString(),
            DestinationPath: parsedURL.path.toString(),
            DestinationProtocol: parsedURL.protocol.toString(),
            Method: pMethod.toString(),
            dateEventHuman: Date(dateNow).toString()
    };

    logger.logFunction('AccountingInformation', accountingInformation, logger.verboseLevel);
    logger.logFunction('URL', parsedURL, logger.verboseLevel);
    accountingFunction(dateNow.toString(), accountingInformation, exports.debugLevel);

};


// Print Redis
exports.printHmsetKeys = function (pArgKey, pMaxKeys, pOutputFileName, pHTMLFormat, pHTMLHeader, functionToCallBackWhenEnd) {


    var internalKey = typeof(pArgKey) === 'undefined' ? accountingPrefix : pArgKey,
        vMaxKeys = typeof(pMaxKeys) === 'undefined' ? exports.maxKeysToProcess : pMaxKeys,
        vOutputFileName = typeof(pOutputFileName) === 'undefined' ? 'stdout' : pOutputFileName,
        internalHTMLFormat = typeof(pHTMLFormat) === 'undefined' ? false : pHTMLFormat,
        vHTMLHeader = typeof(pHTMLHeader) === 'undefined' ? '' : pHTMLHeader ,
        callbackFunction = typeof(functionToCallBackWhenEnd) === 'undefined' ? function () {} : functionToCallBackWhenEnd,
        fileStream,
        dataStructure = [],
        i, numberOfKeysToPrint;

    dbReadActivity = true;
    dbRedisInternalCall = true;

    logger.logFunction('Calling Redis with '+ internalKey + '*', logger.verboseLevel);

    // Any main key
    redisClient.keys(internalKey + '*', function (err, listOfKeys) {
        dbReadActivity = true;
        dbRedisInternalCall = false;

        if (err) {
            logger.logFunction('Problem within redis keys function call: ', error, logger.quietLevel);
            callbackFunction(pOutputFileName);
            return;
        }

        // Number of keys to Print
        numberOfKeysToPrint = vMaxKeys === 0 ? listOfKeys.length : Math.min(vMaxKeys,listOfKeys.length);

        logger.logFunction('Success within redis keys function call. Number of keys' +  listOfKeys.length+
            '. Limited to ' + numberOfKeysToPrint + '.', logger.verboseLevel);

        fileStream = vOutputFileName !== 'stdout' ? createOutputFile(vOutputFileName) : process.stdout;

        // HTML headers
        if (internalHTMLFormat === true) {
            logger.logFunction('HTML header: ', vHTMLHeader, logger.verboseLevel);
            // Headers
            fileStream.write(vHTMLHeader);
            fileStream.write('OL\n');
        }

        if (numberOfKeysToPrint === 0) {
            logger.logFunction('Redis accounting: 0 Keys to print ', logger.verboseLevel);

            if (vOutputFileName === 'stdout') {
                callbackFunction(pOutputFileName);
            } else {
                fileStream.close(function () {
                    callbackFunction(pOutputFileName);
                });
            }
        } else {

            // Everyone but the last one
            for (i = 0; i < (numberOfKeysToPrint - 1); i += 1) {

                logger.logFunction('AccountingInformation: processing Key number ' + i, logger.verboseLevel);
                printDataStructure(listOfKeys[i], fileStream, internalHTMLFormat);
            }

            // The last one
            logger.logFunction('AccountingInformation: processing Key number ' + i, logger.verboseLevel);

            printDataStructure(listOfKeys[numberOfKeysToPrint - 1], fileStream, internalHTMLFormat, callbackFunction, pOutputFileName);
        }
    });
};

//
// Initialize (may ben not) the DB and maxTimeToWait
//
exports.init = function (initializeDB, timeToWaitForDB) {
    var internalDBInitialize = typeof(initializeDB) === 'undefined' ? false : initializeDB;
    exports.msDBInactivityToWait = typeof(timeToWaitForDB) === 'undefined' ? exports.msDBInactivityToWait : timeToWaitForDB;

    if (internalDBInitialize === true) {
        connectToDB();
        dbOpened = true;
    }
};

exports.callWhenNoDBActivity = function (typeOfActivity, callbackFunction, cbParameter1, cbParameter2, cbParameter3) {
    var vTypeOfActivity = (typeof(typeOfActivity) === 'undefined') ? exports.dbRWActivity : typeOfActivity,
        vCBFunction = (typeof(callbackFunction) === 'undefined') ? function () {
        } : callbackFunction;

    if (dbOpened === true) {
        dbReadActivity = dbWriteActivity = true;

        // Let's wait for a second before closing and ending
        setInterval(function () {
            if ((dbRedisInternalCall === false) &&
                (((vTypeOfActivity === exports.dbRWActivity) && ( dbReadActivity === false ) && ( dbReadActivity === false )) ||
                    ((vTypeOfActivity === exports.dbRActivity) && ( dbReadActivity === false )) ||
                    ((vTypeOfActivity === exports.dbWActivity) && ( dbWriteActivity === false )))
                ) {
                clearInterval(this);
                logger.logFunction("Calling back a function when no DB activity", logger.verboseLevel);
                vCBFunction(cbParameter1, cbParameter2, cbParameter3);
            }
            dbReadActivity = dbWriteActivity = false;
        }, exports.msDBInactivityToWait);
    }
};

exports.end = function () {
    exports.callWhenNoDBActivity(exports.dbRWActivity, closeDB, false);
};


exports.initProducer = function () {
    redisProducer = redis.createClient();

    redisProducer.on("subscribe", function (channel, count) {
        logger.logFunction('Producer subscription to ' + channel + ' (' + count + ' channels)', logger.verboseLevel);
    });

    redisProducer.on("unsubscribe", function (channel, count) {
        logger.logFunction('Producer unsubscription to ' + channel + ' (' + count + ' channels)', logger.verboseLevel);
    });

    redisProducer.on("ready", function () {
        logger.logFunction('Producer ready', logger.verboseLevel);
    });
};

exports.initConsumer = function () {
    redisConsumer = redis.createClient();

    redisConsumer.on("subscribe", function (channel, count) {
        logger.logFunction('Consumer subscription to ' + channel + ' (' + count + ' channels)', logger.verboseLevel);
    });

    redisConsumer.on("unsubscribe", function (channel, count) {
        logger.logFunction('Consumer unsubscription to ' + channel + ' (' + count + ' channels)', logger.verboseLevel);
    });

    redisConsumer.on("ready", function () {
        logger.logFunction('Consumer ready', logger.verboseLevel);
    });
};

exports.endProducer = function () {
    redisProducer.end();
};

exports.endConsumer = function () {
    redisConsumer.end();
};

exports.subscribeToChannel = function (channelName) {

    redisConsumer.subscribe(channelName);

};

exports.unsubscribeToChannel = function (channelName) {

    redisConsumer.unsubscribe("channelName");
};

exports.callMeOnMessage = function (callBackFunction) {

    redisConsumer.on("message", function (channel, message) {
        logger.logFunction('Consumer: received a message on channel ' + channel + ' : ' + message, logger.verboseLevel);
        callBackFunction(channel, message);
    });
};

exports.sendMessage = function (channelName, message) {
    logger.logFunction('Producer: sending a message on channel ' + channelName + ' : ' + message, logger.verboseLevel);
    redisProducer.publish(channelName, message);
};

