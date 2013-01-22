var http = require('http');
var net = require('net');
var url = require('url');


var options = {
    host: 'localhost',
    port: 3000,
    path: 'http://www.tid.es',
    method: 'GET',
    headers: {
    	host: "www.tid.es"
    }
}

process.on('uncaughtException', function (err) {
    console.log('Caught exception:' + err);
});

// options.path='/';

var req = http.request(options, function (res) {
    res.setEncoding('utf8');
    var data = "";
    res.on('data', function (d) {
        data += d;
    });
    res.on('end', function () {
        console.log('Data: ' + data);
   		console.log('Status es ' + res.statusCode );
    });
    res.on('error', function(e) {
        console.log( 'Error: ' + e);
    });
});

req.end();

/*
req.on('connect', function(res, socket, head) {
    console.log('got connected!');

    // make a request over an HTTP tunnel
    socket.write('GET / HTTP/1.1\r\n' +
                 'Host: www.tid.es:80\r\n' +
                 'Connection: close\r\n' +
                 '\r\n');
    
    socket.on('data', function(chunk) {
      console.log(chunk.toString());
    });

    socket.on('end', function() {
      console.log('End');
    });

});
*/

