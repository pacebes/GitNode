var http = require('http');
var auth = require("http-auth");
var net = require('net');
var url = require('url');
var url = require('url');
var domain = require('domain');
var redis = require('redis');
var proxy, redisClient, redisDB = 15210;

//
// Loggin and accounting
//
var enableLog = true, gLogLevel = 5;
var enableAccounting = true, gAccountingLevel = 5, accountingPrefix = 'NODE_MRU';
var debugLevel = 5, verboseLevel = 6, quietLevel = 1, muteLevel = 0;

// Server variables
var proxyIPtoListenOn = '127.0.0.1';
var proxyPortToListenOn = 3000;


/*
 process.on('uncaughtException', function (err) {
 console.log('Caught exception: ' + err);
 });
*/

// basic Auth
var basic = auth({
    authRealm: "Cozuelos private area",
    authFile: __dirname + "/htpasswd",
    authType: "basic",
});

//
// Function for login purposes only
//
var logFunction = function (meaning, objecttoShow, fLogLevel) {
    if ((enableLog === true) && (fLogLevel <= gLogLevel)) {
        console.log('** BEGIN ** ' + meaning + ' **');
        console.log(objecttoShow);
        console.log('*** END *** ' + meaning + ' **');
    }
};

//
// Logs information to a redis database for accounting purposes
//
var accountingFunction = function (AccountingKey, accountingValue, fAccountingLevel) {
    if ((enableAccounting === true) && (fAccountingLevel <= gAccountingLevel)) {
        redisClient.hmset(accountingPrefix+AccountingKey,accountingValue);
    }
};

//
// Print a URL after parsing it
//
var printURL = function (urlToPrint) {
    var parsedURL = url.parse(urlToPrint, true);
    logFunction('URL', parsedURL, quietLevel);
};

//
// Connect to a redis server and set te right database
//
var connectToDB = function () {

    redisClient = redis.createClient();

    redisClient.on("error", function (err) {
        logFunction("Redis error", err, quietLevel);
    });

    redisClient.on("end", function (err) {
        logFunction("Redis error", err, quietLevel);
    });

    // Select the redis Database
    redisClient.select(redisDB, function () { /* ... */ });
};

//
// Close the redis dabase in an ordered way
//
var closeDB = function () {

    redisClient.quit();
    // redisClient.end() is useful for timeout cases where something is stuck or taking too long and you want to start over.
};


// Connect to DB for logging
connectToDB();


// create a top-level domain for the server
var rootServerDomain = domain.create();

// From a warning message:
// (node) warning: possible EventEmitter memory leak detected. 11 listeners added. Use emitter.setMaxListeners() to increase limit.
//
// process.setMaxListeners(1000);
// rootServerDomain.setMaxListeners(1000);

// Global Server Domain error control
rootServerDomain.on('error', function(er) {
    console.error('Caught error on server Domain!');
});

//
// Run the server in a specific domain
//
rootServerDomain.run(function() {
    proxy = http.createServer();
});

// Connect
// Not used
proxy.on('connect', function (req, cltSocket, head) {
    console.log('Connect received');

    // connect to an origin server
    var srvUrl = url.parse('http://' + req.url);
    var srvSocket = net.connect(srvUrl.port, srvUrl.hostname, function() {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: Node-Proxy\r\n' +
            '\r\n');
        srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
    });
});

//
// main http server loop
//
proxy.on('request', function(request, response) {

    // Basic authentication
// 	basic.apply(request, response, function(username) {
//		logFunction ('Basic apply received', username, quietLevel);

    var parsedURL = url.parse(request.url, true);
    var opts = {
        host: parsedURL.host,
        protocol: parsedURL.protocol,
        port: parsedURL.port,
        path: parsedURL.path,
        method: request.method,
        headers: request.headers,
    };

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

    logFunction('AccountingInformation', accountingInformation, verboseLevel);

    accountingFunction (dateNow.toString(), accountingInformation, debugLevel);

    logFunction('OriginHost', request.connection.remoteAddress, verboseLevel);
    logFunction('URL', parsedURL, verboseLevel);

    rootServerDomain.on('error', function(er) {
        console.error('Error within rootServerDomain');
        try {
            response.writeHead(500);
            response.end('Error occurred, sorry.');
            response.on('close', function() {
            });
        } catch (er) {
            console.error('Error sending 500', er, proxy.response);
        }
    });

    // http client
    var sourceHTTP;

    // create a domain for proxy-to-origin client
    var proxyToOriginDomain = domain.create();


    // Proxy to Origin Domain error control
    proxyToOriginDomain.on('error', function(er) {
        console.error('Caught error on proxyToOrigin Domain! Method (',sourceHTTP.method, ') ',
            sourceHTTP._headers.host+sourceHTTP.path);
        try {
            response.writeHead(500);
            response.end('Error occurred, sorry.');
            response.on('close', function() {
            });
        } catch (er) {
            console.error('Error sending 500 to EndUser');
        }
    });

    proxyToOriginDomain.run(function() {
        sourceHTTP = http.request(opts);
    });

    sourceHTTP.on('response', function (resSource) {

        // We should state the statusCode before the first write
        response.statusCode=resSource.statusCode;
        response.writeHead(resSource.statusCode, resSource.headers);

        logFunction('Headers', JSON.stringify(resSource.headers), verboseLevel);

        resSource.on('data', function (d) {
            try {
                response.write(d);
            } catch (er) {
                console.error('Error response.write', er);
            }
        });
        resSource.on('end', function () {
            response.end();
        });

        resSource.on('error', function (exception) {
            response.end();
        });

    });

    request.on('data', function(chunk) {
        // we process the data
        sourceHTTP.write(chunk);
    });

    request.on('clientError', function (exception) {
        sourceHTTP.end();

    });

    request.on('error', function (exception) {
        sourceHTTP.end();

    });

    request.on('end', function () {
        sourceHTTP.end();

    });
// 	});

});

proxy.on('connection', function (socketConnection) {
    // Just in case I need it
});

proxy.on('close', function() {
    logFunction('General Info', 'Close received', quietLevel);
});


// Running proxy
proxy.listen(proxyPortToListenOn, proxyIPtoListenOn, function() {
});

