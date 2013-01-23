var http = require('http');
var url = require('url');
var auth = require("./psAuth.js");
var logger = require('./pslogger.js');
// Server variables
var proxyIPtoListenOn = '127.0.0.1';
var proxyPortToListenOn = 3000;

// Connect to DB for logging
logger.connectToDB();

process.on('error', function (err) {
    console.log('Process error: ' + err);
});

process.on('uncaughtException', function (err) {
    console.log('Process Caught exception: ' + err);
 });


http.createServer(function(request, response) {

    if ( auth.checkValidIPAgent(request, response) === false) {
        return;
    }

    logger.genAccountInformation(request);
    var parsedURL = url.parse(request.url, true);
    var opts = {
        host: parsedURL.host,
        protocol: parsedURL.protocol,
        port: parsedURL.port,
        path: parsedURL.path,
        method: request.method,
        headers: request.headers,
    };

    var proxy_request = http.request(opts);
    proxy_request.on('response', function (proxy_response) {
        logger.logFunction('Headers', JSON.stringify(proxy_response.headers), logger.verboseLevel);
        proxy_response.pipe(response);
        response.writeHead(proxy_response.statusCode, proxy_response.headers);
    });
    request.pipe(proxy_request);

}).listen(proxyPortToListenOn);


