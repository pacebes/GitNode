/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 13:32
 * To change this template use File | Settings | File Templates.
 */
var logger = require('./pslogger.js');

var authUsers = [
    [ 'mru', 'mrup'],
    [ 'pacebes', 'p'],
    [' tres', 't']
];

// Seconds
var authorizationLiveTime = 30000;

// OriginIP,lastValidated,userAgent
var validatedIPMachines = [
    ['', 0, '' ],
];

var validateUser = function (user, password) {
    var returnValue = false;

    for (var i = 0; i < authUsers.length; i+=1) {
        if ((authUsers[i][0] === user) && (authUsers[i][1] === password)) {
            returnValue = true;
            break;
        }
    }
    return (returnValue);
}

var validateAuth = function (originIP, userAgent)
{
    var returnValue = false;

    for (var i = 0; i < validatedIPMachines.length; i+=1) {
        if ((validatedIPMachines[i][0] === originIP) && (validatedIPMachines[i][2] === userAgent)) {
            var justNow = Date.now();

            if (justNow <= ( validatedIPMachines[i][1] + authorizationLiveTime)) {
                validatedIPMachines[i][1] = justNow;
                returnValue = true;
            }
            else {
                validatedIPMachines.splice(i,1);
            }
            break;
        }
    }
    return (returnValue);

}

var addAuth = function (originIP, userAgent)
{
    validatedIPMachines[validatedIPMachines.length] = [originIP, Date.now(), userAgent];
}

exports.checkValidIPAgent = function(request, response) {

    // Basic authentication
    var auth = request.headers['authorization'];  // auth is in base64(username:password)  so we need to decode the base64

    if ( validateAuth( request.connection.remoteAddress.toString(), request.headers['user-agent'] ) === false ) {
        if (!auth) {

            logger.logFunction('No auth within headers', logger.quietLevel);

            // No Authorization header was passed in so it's the first time the browser hit us
            // Sending a 401 will require authentication, we need to send the 'WWW-Authenticate' to tell them the sort of authentication to use
            // Basic auth is quite literally the easiest and least secure, it simply gives back  base64( username + ":" + password ) from the browser
            response.statusCode = 401;
            response.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');

            response.end('<html><body>Need some creds son</body></html>');
            return (false);
        }
        else if(auth) {    // The Authorization was passed in so now we validate it
            var tmp = auth.split(' ');   // Split on a space, the original auth looks like  "Basic Y2hhcmxlczoxMjM0NQ==" and we need the 2nd part

            var buf = new Buffer(tmp[1], 'base64'); // create a buffer and tell it the data coming in is base64
            var plain_auth = buf.toString();        // read it back out as a string
            // At this point plain_auth = "username:password"

            var creds = plain_auth.split(':');      // split on a ':'
            var username = creds[0];
            var password = creds[1];

            if (validateUser (username, password) === true) {
                addAuth(request.connection.remoteAddress.toString(), request.headers['user-agent']);

                logger.logFunction('User validated:', username + ' from ' + request.connection.remoteAddress.toString(),
                    logger.quietLevel);
                return (true);
            }
            else {
                logger.logFunction('User NOT validated:', username + ' from ' + request.connection.remoteAddress.toString(),
                    logger.quietLevel);
                response.statusCode = 401; // Force them to retry authentication
                response.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');

                // res.statusCode = 403;   // or alternatively just reject them altogether with a 403 Forbidden

                response.end('<html><body>User & password required</body></html>');
                return (false);
            }
        }
    }
    else
    {
        return (true);
    }
}