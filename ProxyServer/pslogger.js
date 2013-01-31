/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 09:40
 * To change this template use File | Settings | File Templates.
 */
"use strict";

var http = require('http');
var url = require('url');
var fs = require( 'fs' );
var sys = require('sys');
var childP = require('child_process');
var moment = require('moment');

//
// Logging
//
var enableLog = true, gLogLevel = 5;
var logIntervalID;
var procLastData;
exports.debugLevel = 5;
exports.verboseLevel = 6;
exports.quietLevel = 1;
exports.muteLevel = 0;
exports.defaultReportingPeriod = 30000;

var generateMemoryLog = function () {

    var currentMemoryUsage, memoryTextInformation;
    currentMemoryUsage = process.memoryUsage();

    memoryTextInformation = ' RSSmem: ' + currentMemoryUsage.rss + ' (' + (currentMemoryUsage.rss - procLastData.memory.rss) + ')' +
        ' HT: ' + currentMemoryUsage.heapTotal + ' (' + (currentMemoryUsage.heapTotal - procLastData.memory.heapTotal) + ')' +
        ' HU: ' + currentMemoryUsage.heapUsed + ' (' + (currentMemoryUsage.heapUsed - procLastData.memory.heapUsed) + ').';

    procLastData.memory = currentMemoryUsage;

    return memoryTextInformation;
};

var generateCPULog = function (reportToParent, verbosityLevel, initialText) {

    var commandToExecute, cpuUsage = "0";
    var childOptions = {
        encoding:'utf8',
        timeout:5000, // It shouldn't take more than 5 seconds.
        maxBuffer:200 * 1024,
        killSignal:'SIGTERM',
        cwd:null,
        env:null };

    commandToExecute = 'ps -o %cpu -p ' + process.pid + ' | tail -1';
    exports.logFunction('Command to execute: ' + commandToExecute, exports.verboseLevel);

    childP.exec(commandToExecute, function (error, stdout, stderr) {
        if (stderr.length > 0) {
            exports.logFunction('CPU usage command has returned an error: ' + stderr, verbosityLevel);
        }

        if (error !== null) {
            exports.logFunction('CPU usage command exec error: ' + error, verbosityLevel);
        }
        else {
            cpuUsage = stdout.trim();
            exports.logFunction(initialText + ' %CPU: ' + cpuUsage, verbosityLevel);
            procLastData.cpuUsage = cpuUsage;
        }
    });

};


var logProcUse = function (reportToParent, verbosityLevel, initialText, cpuReporting, memoryReporting) {

    var logText;
    logText = initialText + '.';

    if (memoryReporting === true) {
        logText += generateMemoryLog();
    }

    if (cpuReporting === true) {
        generateCPULog(reportToParent, verbosityLevel, logText);
    }
    else {
        exports.logFunction(logText, verbosityLevel);
        if (reportToParent === true) {
            process.send({cmd:"reportProcData", memory:procLastData.memory, CPU:procLastData.cpuUsage,
                process:process.pid});
        }
    }
};


var getLinuxCPUUsage = function (cb) {

    var procFile = "/proc/" + process.pid + "/stat";

    exports.logFunction('Reading the process file: ' + procFile, logger.quietLevel);

    fs.readFile("/proc/" + process.pid + "/stat", function (err, data) {
        if (err) {
            exports.logFunction('Error reading /proc file', err, logger.quietLevel);
            return;
        }

        console.log('-----', data);

        var elems = data.toString().split(' ');
        var utime = parseInt(elems[13]);
        var stime = parseInt(elems[14]);

        cb(utime + stime);
    });
};

var logLinuxCPUUsage = function () {

    setInterval(function () {
        getLinuxCPUUsage(function (startTime) {
            setTimeout(function () {
                getLinuxCPUUsage(function (endTime) {
                    var delta = endTime - startTime;
                    // On POSIX systems, there are 10000 ticks per second (per processor)
                    var percentage = 100 * (delta / 10000);

                    console.log('CPU usage: ', percentage);
                });
            }, 1000);
        });
    }, reportingPeriod);
};


exports.setLoggingLevel = function (logEnabled, logLevel) {
    enableLog = logEnabled;
    gLogLevel = logLevel;
};

exports.timeStamp = function () {
    return(Date.now());
};

exports.humanTimeStamp = function () {

    return (Date(exports.timeStamp()).toString());
};

exports.logTimeStamp = function () {
    return(moment().format());
};

//
// Function for login purposes only
//
exports.logFunction = function (meaning, objectToShow, fLogLevel) {

    var isThereAnObjectToShow;

    if (typeof (fLogLevel) === 'undefined') {
        // only two paramaters were passed, so web have to rerder
        fLogLevel = objectToShow;

        // No objectToShow
        isThereAnObjectToShow = false;
    }
    else {
        isThereAnObjectToShow= true;
    }

    // If not logLevel let's say it is verbose
    fLogLevel = (typeof(fLogLevel) === 'undefined') ? exports.verboseLevel : fLogLevel;

    if ((enableLog === true) && (fLogLevel <= gLogLevel)) {

        if ( isThereAnObjectToShow === true ) {
            console.log('** BEGIN ** ' + meaning + ' ** ' + exports.logTimeStamp() + '(PID ' + process.pid + ')' );
            console.log(objectToShow);
            console.log('*** END *** ' + meaning + ' ** ');
        }
        else {
            console.log(exports.logTimeStamp() + '(' + process.pid + '): ' + meaning);
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


exports.enableProcLogging = function (reportingPeriod, reportToParent, verbosityLevel, initialText, cpuReporting, memoryReporting) {
    procLastData = { cpuUsage:"XXX", memory:{rss:0, heapTotal:0, heapUsed:0} };
    logIntervalID = setInterval(logProcUse, reportingPeriod, reportToParent, verbosityLevel, initialText, cpuReporting, memoryReporting);
};

exports.disableProcLogging = function () {
    clearInterval(logIntervalID);
    procLastData = { cpuUsage:"XXX", memory:{rss:0, heapTotal:0, heapUsed:0} };
};

//
exports.init = function () {

};

//
exports.end = function () {

};

