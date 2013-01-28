/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 28/01/13
 * Time: 11:19
 * To change this template use File | Settings | File Templates.
 */

var http = require('http');
var url = require('url');
var domain = require('domain');
var logger = require('./psLogger.js');
var acc = require('./psAccounting');
var auth = require("./psProxyAuth.js");

exports.init = function (proxyServerPort, proxyServerIP, redisWorker) {

    // DB initialization
    acc.init (true);
    //
    // Web server
    //
    http.createServer(function(request, response) {

        if ( auth.checkProxyRequest(request, response) === false) {
            return;
        }

        // Save information
        redisWorker.send({cmd: "account", url: request.url, userIP: request.connection.remoteAddress,
            method: request.method });

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
        // Exception control in the access to origin through domains
        //
        var proxy_request;
        // create a domain for proxy-to-origin client
        var proxyToOriginDomain = domain.create();

        proxyToOriginDomain.run(function() {
            logger.logFunction('Lets open an httpRequest to' + opts, logger.verboseLevel);
            proxy_request = http.request(opts);
        });

        // Proxy to Origin Domain error control
        proxyToOriginDomain.on('error', function(er) {
            logger.logFunction('Caught error on proxyToOrigin domain! Method (' + proxy_request.method + ') ' +
                proxy_request._headers.host+proxy_request.path, logger.quietLevel);
            logger.logFunction('Error on proxyToOrigin domain', er, logger.verboseLevel);
        });


        //
        // Let's pipe both sides.
        //
        proxy_request.on('response', function (proxy_response) {
            //
            // NO 'Keep-Alive' Connection
            //
            proxy_response.headers.connection = 'close';

            logger.logFunction('Headers', JSON.stringify(proxy_response.headers), logger.verboseLevel);
            proxy_response.pipe(response);
            logger.logFunction('Piping webServer To client', logger.verboseLevel);
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
        });

        logger.logFunction('Piping client to webServer', logger.verboseLevel);
        request.pipe(proxy_request);

    }).listen(proxyServerPort, proxyServerIP);

    logger.logFunction('Proxy server running on http://' + proxyServerIP + ':' + proxyServerPort + '/', logger.quietLevel);

}
