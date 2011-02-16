var config = require('./config').config;
var utils = require('./lib/utils');
var gs = require('./lib/gs');
var webServer = require('./lib/web').Server;

utils.log('Starting game server');
var gsServer = gs.createServer(config);
gsServer.start();

utils.log('Starting web server');
var web = new webServer(gsServer, config.web_port);
web.start();

