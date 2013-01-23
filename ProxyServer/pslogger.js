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
var proxy, redisClient, redisDB = 15210;
var redisSemPendingTasks = false;

//
// Loggin and accounting
//
var enableLog = true, gLogLevel = 5;
var enableAccounting = true, gAccountingLevel = 5, accountingPrefix = 'NODE_MRU';
exports.debugLevel = 5, exports.verboseLevel = 6, exports.quietLevel = 1, exports.muteLevel = 0;

exports.setLoggingLevel = function ( logEnabled, logLevel) {
    enableLog = logEnabled;
    gLogLevel = logLevel;
}

exports.setAccountingLevel = function ( accEnabled, accLevel, accPrefix) {
    enableAccounting = accEnabled;
    gAccountingLevel = accLevel;
    accountingPrefix = accPrefix;
}

exports.setDBActivitySemaphore = function ( newSemaphoreValue ) {
    redisSemPendingTasks = newSemaphoreValue;
}


exports.getDBActivitySemaphore = function ( ) {
    return (redisSemPendingTasks);
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
        DateEventmiliseconds: dateNow.toString(),
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
    exports.logFunction('URL', parsedURL, quietLevel);
};

//
// Connect to a redis server and set te right database
//
exports.connectToDB = function () {

    redisClient = redis.createClient();

    redisClient.on("error", function (err) {
        exports.logFunction("Redis error", err, quietLevel);
    });

    redisClient.on("end", function (err) {
        exports.logFunction("Redis end", quietLevel);
    });

    // Select the redis Database
    redisClient.select(redisDB, function () { /* ... */ });
};

//
// Close the redis dabase in an ordered way
//
exports.closeDB = function (force) {
    if ( force === false ) {
        // Wait for ending replies
        redisClient.quit();
    }
    else {
        redisClient.end();
    }
};

//
// Building on hmget redis key and the structure we dive and print data
//
var printKeyData = function ( keyToPrint, structureToPrint)
{
    // Let's sort out the array to show the information that way
    structureToPrint.sort();

    // Still working
    redisSemPendingTasks = true;

    // Data
    redisClient.hmget (keyToPrint, structureToPrint, function(err, d) {
        // print out the data
        structureToPrint.forEach( function ( dataName, i ) {
            console.log (keyToPrint, ':', structureToPrint[i], ': ', d[i]);
        });
        console.log('-----');
    });
}

// Print Redis
exports.printHmsetKeys = function (optionalArgKey, optionalArgFrom, optionalArgTo ) {

    var internalKey = (typeof optionalArgKey === 'undefined') ? accountingPrefix : optionalArgKey;
    var internalFrom = (typeof optionalArgFrom === 'undefined') ? 0 : optionalArgFrom;
    var internalTo = (typeof optionalArgTo === 'undefined') ? 0 : optionalArgTo;

    // Any main key
    redisClient.keys(internalKey + '*', function (err, listOfKeys) {

        if (err) return console.log(err);

        var dataStructure = [];

        // We dive within the keys to know the structure
        listOfKeys.forEach (function ( lkElement, i ) {

            // Still working
            redisSemPendingTasks = true;

            // We obtain the structure (not optimal, but generic)
            redisClient.hkeys(lkElement, function(err, replies) {

                dataStructure = [];

                // For each element we get the structure
                replies.forEach(function (reply, i) {
                    dataStructure.push(reply);
                });

                // Let's print everything
                printKeyData (lkElement, dataStructure);
            });
        });
    });
};
