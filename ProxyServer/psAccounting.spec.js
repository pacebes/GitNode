/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 04/02/13
 * Time: 16:42
 * To change this template use File | Settings | File Templates.
 */

var acc = require('./psAccounting.js');
var logger = require('./psLogger');

describe("Accounting test", function() {
    beforeEach(function () {
        acc.init(true, 3000);
    });

    it ('Spy on init', function () {
        spyOn(acc,'init');
        acc.init(true, 500);
        expect(acc.msDBInactivityToWait,500);
    });

    it('Spy on callWhenNoDBActivity', function() {
        var called = false;
        var param1 = "", param2 = "", param3 = "";
        spyOn(logger, 'logFunction');

        var callMeBack = function (p1, p2, p3) {
            called = true; param1 = p1; param2 = p2; param3 = p3;
        }

        acc.init(true, 500);
        acc.callWhenNoDBActivity(acc.dbRWActivity, callMeBack, "One", "Two", "Three" );

        // Wait until "called" is true which means it has been called
        waitsFor(function(){ return called; }, "Waiting for callMeBack to be called",1000 );

        runs(function(){expect(called).toBeTruthy();});
        runs(function(){expect(param1).toBe("One");});
        runs(function(){expect(param2).toBe("Two");});
        runs(function(){expect(param3).toBe("Three");});
        runs(function(){expect(logger.logFunction).toHaveBeenCalled()});
    });

});


