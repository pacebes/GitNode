var cluster = require('cluster');
var cp = require('child_process');
var logger = require('./psLogger.js');

// Server variables
var proxyIPtoListenOn = '127.0.0.1', proxyPortToListenOn = 3000;
var jadeServerIP='127.0.0.1', jadeServerPort = 8080;
var accessWebChild, redisProxyChild, mainProxyserver,
    accessWebJS ='./psMainAccView.js', redisProxyJS ='./psMainRedisProxy.js', mainProxyServerJS='./psMainProxyServer.js';
var childList =[];

// Check Arguments
var argv = require('optimist')
    .usage('Run a proxy Server.\nUsage: $0')
    .options({
        proxyServerPort : {
            demand : true,
            alias : 'pp',
            description : 'Define the port at which the proxy server will listen'
        },
        proxyServerIP : {
            demand : false,
            alias : 'pip',
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


var processMsgFromChildren = function(message) {

    if (typeof(message) === 'undefined') {
        return;
    }

    switch (message.cmd) {

        case 'ready':
            logger.logFunction('Master: received a READY message from ' + message.origin + ' (PID ' + message.pid + ') ', logger.quietLevel);
            // We only add children for the time being.
            childList[childList.length] = {processDesc: message.origin, processPID:message.pid};
            break;

        case "account":
            logger.logFunction('Forwarding account message to the logger', logger.verboseLevel);
            // Let's forward the message to the parent
            redisProxyChild.send(message);
            break

        default:
            logger.logFunction('Master: received an unknown message', message, logger.quietLevel);
            break;
    }
};


var createChildRedisProxy = function () {
    redisProxyChild = cp.fork(redisProxyJS);
    redisProxyChild.on('message', processMsgFromChildren);
}

var createChildWebAccServer = function( port, IP) {
    accessWebChild = cp.fork(accessWebJS, [port, IP] );
    accessWebChild.on('message', processMsgFromChildren);
}

var createChildProxyController = function(port, IP)
{
    mainProxyserver = cp.fork(mainProxyServerJS, [port, IP] );
    mainProxyserver.on('message', processMsgFromChildren);
}

createChildRedisProxy();
createChildWebAccServer(jadeServerPort, jadeServerIP);
createChildProxyController(proxyPortToListenOn, proxyIPtoListenOn);

logger.enableProcLogging(logger.defaultReportingPeriod, false, logger.quietLevel, 'RootProcess  ', true, true);

