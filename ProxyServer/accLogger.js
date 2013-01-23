var logger = require('./pslogger.js');


// Just for enjoying: some process control
process.on('SIGTSTP', function () {
	console.log('Got SIGTSTP. Please press Control-C');
	});

process.on('SIGINT', function () {
	console.log('Got SIGINT. Bye ');
	process.exit(1);
});

process.on('SIGKILL', function () {
	console.log('Got SIGKILL. Bye');
	endDBConnection (true);
	process.exit(1);
});
/*
process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
*/

// Initial value
logger.setDBActivitySemaphore(true);

// A non optimal way to wait until no pending events
// Check every X seconds (now 1000)
setInterval(function () {
	if ( logger.getDBActivitySemaphore() === false ) {
		logger.closeDB (false);
		clearInterval(this);
	}
	else {
        logger.setDBActivitySemaphore(false);
	}

} , 1000);

// Let's work
logger.connectToDB();
logger.printHmsetKeys();



