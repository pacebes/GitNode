var http = require('http');
var url = require('url');
var domain = require('domain');
var auth = require("./psProxyAuth.js");
var logger = require('./pslogger.js');
var view = require('./psAccView.js');
// Server variables
var proxyIPtoListenOn = '127.0.0.1', proxyPortToListenOn = 3000;
var jadeServerIP='127.0.0.1', jadeServerPort = 8080;

// Check Arguments
var argv = require('optimist')
    .usage('Run a proxy Server.\nUsage: $0')
    .options({
        proxyServerPort : {
            demand : true,
            alias : 'p',
            description : 'Define the port at which the proxy server will listen'
        },
        proxyServerIP : {
            demand : false,
            alias : 'ip',
            description :  'Define the port at which the proxy server will listen',
            default : proxyIPtoListenOn
        },
        webServerPort : {
            demand : false,
            alias : 'wp',
            description : 'Define the port at which the web server will listen',
            default: jadeServerPort
        },
        webServerIP : {
            demand : true,
            alias : 'wi',
            description :  'Define the port at which the web server will listen',
            default : jadeServerIP
        }
    }).argv;

// Gathered values
proxyIPtoListenOn = argv.proxyServerIP; proxyPortToListenOn = argv.proxyServerPort;
jadeServerIP = argv.webServerIP; jadeServerPort = argv.webServerPort;

//
// Exception control
//
process.on('error', function (err) {
    console.log('Process error: ' + err);
});

process.on('uncaughtException', function (err) {
    console.log('Process Caught exception: ' + err);
 });

// DB initialization
logger.init (true);
//
// Web server
//
http.createServer(function(request, response) {

    if ( auth.checkProxyRequest(request, response) === false) {
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


    //
    // Exception control in the access to origin through domains
    //
    var proxy_request;
    // create a domain for proxy-to-origin client
    var proxyToOriginDomain = domain.create();

    proxyToOriginDomain.run(function() {
        proxy_request = http.request(opts);
    });
    // Proxy to Origin Domain error control
    proxyToOriginDomain.on('error', function(er) {
        console.error('Caught error on proxyToOrigin Domain! Method (',proxy_request.method, ') ',
            proxy_request._headers.host+proxy_request.path);
    });

    //
    // Let's pipe both sides.
    //
    proxy_request.on('response', function (proxy_response) {
        logger.logFunction('Headers', JSON.stringify(proxy_response.headers), logger.verboseLevel);
        proxy_response.pipe(response);
        response.writeHead(proxy_response.statusCode, proxy_response.headers);
    });
    request.pipe(proxy_request);

}).listen(proxyPortToListenOn,proxyIPtoListenOn);

console.log('Proxy server running on http://' + proxyIPtoListenOn + ':' + proxyPortToListenOn + '/')


view.runJadeServer(jadeServerPort, jadeServerIP);
