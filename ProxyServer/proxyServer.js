var http = require('http');
var net = require('net');
var url = require('url');
var domain = require('domain');
var logger = require('./psLogger.js');
var auth = require("./psProxyAuth.js");
// Server variables
var proxyIPtoListenOn = '127.0.0.1';
var proxyPortToListenOn = 3000;

/*
 process.on('uncaughtException', function (err) {
 console.log('Caught exception: ' + err);
 });
*/

// Connect to DB for logging
logger.init (true);

// create a top-level domain for the server
var rootServerDomain = domain.create();

//
// Run the server in a specific domain
//
rootServerDomain.run(function() {
    proxy = http.createServer();
});

// On Connect
proxy.on('connect', function (request, cltSocket, head) {
    logger.logFunction('on.connect', request.url, logger.verboseLevel);

    // connect to an origin server
    var srvUrl = url.parse('http://' + request.url);
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

    /*
    if ( auth.checkProxyRequest(request, response) === false) {
        return;
    }
*/

    var parsedURL = url.parse(request.url, true);
    var opts = {
        host: parsedURL.host,
        protocol: parsedURL.protocol,
        port: parsedURL.port,
        path: parsedURL.path,
        method: request.method,
        headers: request.headers,
    };

    logger.saveProxyInformation(request);

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

    sourceHTTP = http.request(opts);

    sourceHTTP.on('response', function (resSource) {

        resSource.headers.connection = 'close';
        // We should state the statusCode before the first write
        response.statusCode=resSource.statusCode;
        response.writeHead(resSource.statusCode, resSource.headers);

        logger.logFunction('Source headers', JSON.stringify(resSource.headers), logger.verboseLevel);


        resSource.on('data', function (d) {
            try {
                response.write(d);
            } catch (er) {
                console.error('Error response.write', er);
            }
        });

        resSource.on('end', function () {
            logger.logFunction('Source end received');
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

    request.on('error', function (exception) {
        sourceHTTP.end();

    });

    request.on('end', function () {
        sourceHTTP.end();

    });

});

proxy.on('connection', function (socketConnection) {
    // Just in case I need it
});

proxy.on('close', function() {
    logger.logFunction('General Info', 'Close received', logger.quietLevel);
});


// Running proxy
proxy.listen(proxyPortToListenOn, proxyIPtoListenOn, function() {
});

