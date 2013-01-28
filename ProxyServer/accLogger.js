var logger = require('./psLogger.js');


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
// We init the logger process with DB connection
logger.init (true,2000);
logger.printHmsetKeys('NODE_MRU', 'stdout', false, '');
logger.end ();



