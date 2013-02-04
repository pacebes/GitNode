/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 04/02/13
 * Time: 10:21
 * To change this template use File | Settings | File Templates.
 */
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

});

