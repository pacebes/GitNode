var http = require('http');
var auth = require("http-auth");
var net = require('net');
var url = require('url');
var domain = require('domain');
var redis = require('redis');
var proxy, redisClient;

var enableLog = true, gLogLevel = 5;
var enableAccounting = true, gAccountingLevel = 5, accountingPrefix = 'NODE_MRU';

var debugLevel = 5, verboseLevel = 6, quietLevel = 1, muteLevel = 0;

var proxyIPtoListenOn = '127.0.0.1';
var proxyPortToListenOn = 3000;

var redisDB = 15210;

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


var logFunction = function (meaning, objecttoShow, fLogLevel) {
    if ((enableLog === true) && (fLogLevel <= gLogLevel)) {
        console.log('** BEGIN ** ' + meaning + ' **');
        console.log(objecttoShow);
        console.log('*** END *** ' + meaning + ' **');
    }
};

var printURL = function (urlToPrint) {
    var parsedURL = url.parse(urlToPrint, true);
    logFunction('URL', parsedURL, quietLevel);
};


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

var closeDB = function () {

    redisClient.quit();
    // redisClient.end() is useful for timeout cases where something is stuck or taking too long and you want to start over.
};


var accountingFunction = function (AccountingKey, accountingValue, fAccountingLevel) {
    if ((enableAccounting === true) && (fAccountingLevel <= gAccountingLevel)) {

        console.log(accountingPrefix+AccountingKey, accountingValue);
        redisClient.hmset(accountingPrefix+AccountingKey,accountingValue);

    }
};

// Connect to DB for loggin
connectToDB();

// Create an HTTP tunneling proxy with basic authentication
// Example from nodejs.org and others
//

// create a top-level domain for the server
var serverDomain = domain.create();

// Global Server Domain
serverDomain.on('error', function(er) {
    console.error('Caught error on server Domain!', er);
});

serverDomain.run(function() {
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

proxy.on('request', function(request, response) {

    // Basic authentication
// 	basic.apply(request, response, function(username) {
//		logFunction ('Basic apply received', username, quietLevel);

    // Internal domain for request and response
    var reqd = domain.create();
    reqd.add(request);
    reqd.add(response);
    reqd.on('error', function(er) {
        console.error('Error', er, request.url);
        try {
            res.writeHead(500);
            res.end('Error occurred, sorry.');
            res.on('close', function() {
                // forcibly shut down any other things added to this domain
                reqd.dispose();
            });
        } catch (er) {
            console.error('Error sending 500', er, request.url);
            // tried our best.  clean up anything remaining.
            reqd.dispose();
        }
    });

    var parsedURL = url.parse(request.url, true);
    var opts = {
        host: parsedURL.host,
        protocol: parsedURL.protocol,
        port: parsedURL.port,
        path: parsedURL.path,
        method: request.method,
        headers: request.headers,
    };

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

    accountingFunction (dateNow.toString(), accountingInformation, verboseLevel);

    logFunction('OriginHost', request.connection.remoteAddress, verboseLevel);
    logFunction('URL', parsedURL, verboseLevel);


    var sourceHTTP = http.request(opts, function (resSource) {

        // We should state the statusCode before the first write
        response.statusCode=resSource.statusCode;
        response.writeHead(resSource.statusCode, resSource.headers);

        logFunction('Headers', resSource.headers, verboseLevel);

        resSource.on('data', function (d) {
            logFunction ('http_request on_data', 'before', verboseLevel);
            response.write(d);
            logFunction ('http_request on_data', 'after', verboseLevel);
        });
        resSource.on('end', function () {
            logFunction ('http_request on_end Status', resSource.statusCode, verboseLevel);
            response.end();
            logFunction ('http_request. response ended', resSource.statusCode, verboseLevel);
        });

        request.on('error', function (exception) {
            logFunction ('http_request on_Error: exception', exception, verboseLevel);
            sourceHTTP.end();
            logFunction ('http_request on_error', 'after', verboseLevel);
        });

    });

    request.on('data', function(chunk) {
        // we process the data
        logFunction ('http_server on_data', 'before', verboseLevel);
        sourceHTTP.write(chunk);
        logFunction ('http_server on_data', 'after', verboseLevel);
    });

    request.on('clientError', function (exception) {
        logFunction ('http_server on_clientError: exception', exception, verboseLevel);
        sourceHTTP.end();
        logFunction ('http_server on_clientError', 'after', verboseLevel);

    });

    request.on('error', function (exception) {
        logFunction ('http_server on_Error: exception', exception, verboseLevel);
        sourceHTTP.end();
        logFunction ('http_server on_Error', 'after', verboseLevel);

    });


    request.on('end', function () {
        logFunction ('http_server on_request on_end', Date(Date.now()).toString(), verboseLevel);
        sourceHTTP.end();
        logFunction ('http_server on_request on_end', 'after', verboseLevel);

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

