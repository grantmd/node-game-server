var api = require('./api');
var web = require('./web');
var utils = require('../utils');

var Server = function(gs, port){
	var self = this;

	this.gs = gs; // The GS controls all data, so we go through it
	this.port = port;
	this.server = null;

	this.start = function(){

		var express = require("express");
		var server = express();
		var engine = require('ejs-locals');
		var port = self.port || 3000;
		server.listen(port);

		server.set('views', process.cwd() + '/views');
		server.set('view engine', 'ejs');
		server.use(express.logger());
		server.use(express.static(process.cwd() + '/public'));
		server.use(express.compress());
		server.use(express.bodyParser());
		server.engine('ejs', engine);

		// Error handlers
		server.use(express.errorHandler({ showStack: true, dumpExceptions: true }));

		api.handle(server, this.gs);
		web.handle(server, this.gs);

		self.server = server;
		utils.log('Web server started on '+port);
	};
};

exports.Server = Server;