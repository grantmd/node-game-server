var config = require('./config').config;
var gs = require('./lib/gs');
var webServer = require('./lib/web').Server;

console.log('Starting game server');
var gsServer = gs.createServer();
gsServer.start();

console.log('Starting web server');
var web = new webServer(gsServer, config.web_port);
web.start();

