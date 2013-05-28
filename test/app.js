var config = require('../config').config,
	gs = require('../lib/gs'),
	webServer = require('../lib/web').Server,
	assert = require('assert'),
	should = require('should');

describe('app', function(){
	describe('should start', function(){
		var gsServer = gs.createServer(config);

		it('a game server', function(){
			gsServer.start();
		});

		it('a web server', function(){
			var web = new webServer(gsServer, config.web_port);
			web.start();
		});
	});
});