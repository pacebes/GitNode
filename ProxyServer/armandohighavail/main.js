"use strict";
var fs = require('fs');
var argv = process.argv.splice(2);
var serverFile = './staticserver.js';
     
var listenAddress = "0.0.0.0";
var listenPort = 8888;

if (argv.length == 2) {
    listenAddress = argv[0];
    listenPort = argv[1];
}

var server = null;

//
var loadServer = function() {

        if (server != null) {
            server.close();
        }
        delete require.cache[require.resolve(serverFile)]
        var staticserver = require(serverFile);
        server = new staticserver();
        server.listen(listenPort, listenAddress);
    }

//
fs.watchFile(serverFile,  function(e,f) {
        loadServer();
        }
       );

//
process.on('SIGUSR2', function() {
        console.log("Got sigusr!");
        fs.unwatchFile(serverFile);
        loadServer();
    });

//
process.on('SIGINT', function() {
        server.close();
        console.log("Exiting");
        process.exit();
    });

loadServer();

console.log("running as: pid=" + process.pid);
fs.writeFileSync("server.pid", process.pid);

