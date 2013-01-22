var redis = require('redis'),
    redisClient,
    redisDB = 15210,
    redisFunctionCalled = true, // semaphore like
    accountingPrefix = 'NODE_MRU';



// Start DB connection and choose DB 
var startDBConnection = function () {

	redisClient = redis.createClient();

	redisClient.on("error", function (err) {
		console.log("Redis error", err);
	});

	redisClient.on("end", function (err) {
		if (typeof err == 'undefined') {
			console.log ("Redis End");
		}
		else {
			console.log("Redis end with error: ", err);
		}
	});

	// Select the redis Database 
	redisClient.select(redisDB, function () { /* ... */ });
};

// EndDB
var endDBConnection = function (force)
{
	if ( force === false ) {
		// Wait for ending replies
		redisClient.quit();
	}
	else {
		redisClient.end();
	}
}

// 
// Building on hmget redis key and the structure we dive and print data
// 
var printKeyData = function ( keyToPrint, structureToPrint)
{
	// Let's sort out the array to show the information that way
	structureToPrint.sort();

	// Still doing work
	redisFunctionCalled = true;

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
var printAllKeys = function ( ) {

	// Any main key
	redisClient.keys('NODE_MRU*', function (err, listOfKeys) {

	 	if (err) return console.log(err);

		var dataStructure = [];

		// We dive within the keys to know the structure
		listOfKeys.forEach (function ( lkElement, i ) {

			// Still doing work
			redisFunctionCalled = true;

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

// Just for enjoying: some process control
process.on('SIGTSTP', function () {
	console.log('Got SIGTSTP. Please press Control-C');
	});

process.on('SIGINT', function () {
	console.log('Got SIGINT. Bye ');
	endDBConnection (true);
	process.exit(1);
});

process.on('SIGKILL', function () {
	console.log('Got SIGKILL. Bye');
	endDBConnection (true);
	process.exit(1);
});

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});


// A non optimal way to wait until no pending events
// Check every X seconds (now 1000)
setInterval(function () {
	if ( redisFunctionCalled === false ) {
		endDBConnection (false);		
		clearInterval(this);
	}
	else {
		redisFunctionCalled = false;
	}

} , 1000);


// Let's work 
startDBConnection ();
printAllKeys () ;

