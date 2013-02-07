/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 04/02/13
 * Time: 10:21
 * To change this template use File | Settings | File Templates.
 */
var events = require('events');
var logger = require('./psLogger.js');

describe("spy logger", function() {
    var loggerStatus, loggerLevel;

    beforeEach(function () {
        logger.setLoggingLevel(false, logger.muteLevel)
        loggerStatus = logger.getLoggingStatus();
        loggerLevel = logger.getLoggingLevel();
    });

    it('Spy on status and level', function() {
        expect(loggerLevel).toEqual(logger.muteLevel);
        expect(loggerStatus).toEqual(false);
    });

    it('Spy on logFunction: log', function() {
        var ev = new events.EventEmitter();
        process.openStdin = function () { return ev; };

        logger.setLoggingLevel(true, logger.debugLevel);
        var result = null;
        console.log = function(msg) {
            result = msg;
        };

        logger.logFunction('Example to test', logger.quietLevel);

        waitsFor(function(){ return result;}, 'Waiting 3 seconds for console.log to be called', 3000);
        runs(function(){
            var included = result.indexOf('Example to test') != -1 ? true : false;
            expect(included).toBeTruthy();

        });
    });

    it('Spy on logFunction: nolog', function() {
        var ev = new events.EventEmitter();
        process.openStdin = function () { return ev; };

        logger.setLoggingLevel(true, logger.muteLevel);
        var result = null;
        console.log = function(msg) {
            result = msg;
        };

        logger.logFunction('Example to test', logger.quietLevel);

        waits('Waiting 2 seconds for console.log to be called', 2000);

        runs(function(){
            expect(result).toBeNull();

        });
    });
});

