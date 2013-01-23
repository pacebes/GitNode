var http = require('http');
var auth = require("http-auth");
var net = require('net');
var url = require('url');
var domain = require('domain');
var logger = require('./pslogger.js');
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
    // algorithm: 'SHA',
});

// Connect to DB for logging
logger.connectToDB();

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

var authPlaying = function(request, response) {
    // Basic authentication
    var auth = request.headers['authorization'];  // auth is in base64(username:password)  so we need to decode the base64

    if(!auth) {     // No Authorization header was passed in so it's the first time the browser hit us
        // Sending a 401 will require authentication, we need to send the 'WWW-Authenticate' to tell them the sort of authentication to use
        // Basic auth is quite literally the easiest and least secure, it simply gives back  base64( username + ":" + password ) from the browser
        response.statusCode = 401;
        response.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');

        response.end('<html><body>Need some creds son</body></html>');
        return false;
    }

    else if(auth) {    // The Authorization was passed in so now we validate it

        var tmp = auth.split(' ');   // Split on a space, the original auth looks like  "Basic Y2hhcmxlczoxMjM0NQ==" and we need the 2nd part

        var buf = new Buffer(tmp[1], 'base64'); // create a buffer and tell it the data coming in is base64
        var plain_auth = buf.toString();        // read it back out as a string

        console.log("Decoded Authorization ", plain_auth);

        // At this point plain_auth = "username:password"

        var creds = plain_auth.split(':');      // split on a ':'
        var username = creds[0];
        var password = creds[1];

        if((username == 'per') && (password == 'per')) {   // Is the username/password correct?
            return (true);
        }
        else {
            response.statusCode = 401; // Force them to retry authentication
            response.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');

            // res.statusCode = 403;   // or alternatively just reject them altogether with a 403 Forbidden

            response.end('<html><body>You shall not pass</body></html>');
            return (false);
        }
   }

}
//
// main http server loop
//
proxy.on('request', function(request, response) {


    var parsedURL = url.parse(request.url, true);
    var opts = {
        host: parsedURL.host,
        protocol: parsedURL.protocol,
        port: parsedURL.port,
        path: parsedURL.path,
        method: request.method,
        headers: request.headers,
    };

    logger.genAccountInformation(request);

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

        logger.logFunction('Headers', JSON.stringify(resSource.headers), logger.verboseLevel);

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

