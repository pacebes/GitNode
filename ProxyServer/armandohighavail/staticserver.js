"use strict";
//
// Copyright (c) Telefonica I+D. All rights reserved.
//
//
var http = require('http');
var fs = require('fs');
var path = require('path');
var basepath = './';

module.exports = function() {

	var server = http.createServer(function (req, resp) {
	
		if (req.method != 'GET') {
			resp.writeHead(400);
			resp.end();
			return;
		}

        console.log("v2 server");	
		var s = fs.createReadStream(path.join(basepath, req.url));
 
        if (s == null) {	
			resp.writeHead(404);
			resp.end();
            return;
		};
		
        var hdrs = {'X-Server-Version': '2'};
        hdrs['Content-Length'] = 2097152000;
	    resp.writeHead(200, hdrs);
		s.pipe(resp);
		
		});

    return server;
        
}



