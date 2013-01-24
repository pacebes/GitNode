/**
 * Created with JetBrains WebStorm.
 * User: pacebes
 * Date: 23/01/13
 * Time: 13:32
 * To change this template use File | Settings | File Templates.
 */
var logger = require('./pslogger.js');

// Simple list
var authUsers = [
    [ 'mru', 'mrup'],
    [ 'pacebes', 'p'],
    [' tres', 't']
];


var validateUser = function (user, password) {
    var returnValue = false;

    for (var i = 0; i < authUsers.length; i+=1) {
        if ((authUsers[i][0] === user) && (authUsers[i][1] === password)) {
            returnValue = true;
            logger.logFunction('Proxy user accepted: ' + user, logger.verboseLevel);
            break;
        }
    }
    if (returnValue === false) {
        logger.logFunction('Proxy user NOT accepted: ' + user, logger.verboseLevel);
    }
    return (returnValue);
}

var validateUserFromAuth = function(proxyAuth) {
    var tmp = proxyAuth.split(' ');   // Split on a space, the original auth looks like  "Basic cGFjZWJlczpwZXJpY28==" and we need the 2nd part

    var buf = new Buffer(tmp[1], 'base64'); // create a buffer and tell it the data coming in is base64
    var plain_auth = buf.toString();        // read it back out as a string
    // At this point plain_auth = "username:password"

    var creds = plain_auth.split(':');      // split on a ':'
    var username = creds[0];
    var password = creds[1];

    return (validateUser(username, password));
}

var sendProxyAuthRequest = function(response){

    // 407 Proxy Authentication Required
    response.statusCode = 407;
    response.setHeader('Proxy-Authenticate', 'Basic realm="MRU Secure Area"');
    // console.log(response);
    response.end('<html><body>' + '** Proxy need some creds son **'+ '</body></html>');

    logger.logFunction('Proxy authorization requested', logger.verboseLevel);

}

exports.checkProxyRequest = function(request, response) {

    // Basic authentication
    var proxyAuth = request.headers['proxy-authorization'];  // auth is in base64(username:password)  so we need to decode the base64

    if (!proxyAuth) {

        logger.logFunction('No auth within headers', logger.verboseLevel);

        sendProxyAuthRequest(response);
        return (false);
    }
    else if(proxyAuth) {    // The Authorization was passed in so now we validate it
        if (validateUserFromAuth (proxyAuth)  === true) {
            return (true);
        }
        else {
            sendProxyAuthRequest();
            return (false);
        }
    }
}