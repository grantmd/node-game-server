var utils = require('../utils');

function handle(server, gs){
	// API
	server.post('/api/:method.:format', function(req, res){

		var format = '';
		switch(req.param('format')){
			case 'json':
				res.contentType('application/json');
				format = 'json';
				break;
			default:
				res.send('Invalid response format: '+req.param('format'), 400);
				return;
		}

		//utils.log('API POST: '+req.param('method'));

		var args = {};
		switch(req.param('method')){
			case 'create_player':
				args = {
					name: req.body.name,
					onTick: req.body.onTick,
					map_id: req.body.map_id
				};

				gs.players_add(args, function(ret){
					res.send(JSON.stringify(ret));
				});
				break;

			case 'edit_player':
				args = {
					name: req.body.name,
					onTick: req.body.onTick,
					map_id: req.body.map_id
				};

				gs.players_get(req.body.id, function(player){
					for (var i in args){
						player[i] = args[i];
					}

					gs.players_edit(req.body.id, player, function(ret){
						res.send(JSON.stringify(ret));
					});
				});
				break;

			case 'delete_player':
				gs.players_delete(req.body.id, function(ret){
					res.send(JSON.stringify(ret));
				});
				break;

			///
			case 'create_map':
				args = {
					name: req.body.name,
					width: req.body.width,
					height: req.body.height,
					depth: req.body.depth
				};

				gs.maps_add(args, function(ret){
					res.send(JSON.stringify(ret));
				});
				break;

			case 'edit_map':
				args = {
					name: req.body.name,
					width: req.body.width,
					height: req.body.height,
					depth: req.body.depth
				};

				gs.maps_get(id, function(map){
					for (var i in args){
						map[i] = args[i];
					}

					gs.maps_edit(req.body.id, map, function(ret){
						res.send(JSON.stringify(ret));
					});
				});
				break;

			case 'delete_map':
				gs.maps_delete(req.body.id, function(ret){
					res.send(JSON.stringify(ret));
				});
				break;

			///
			default:
				res.send(JSON.stringify({ok: false, error: 'Invalid method: '+req.param('method')}), 400);
				return;
		}
	});


	server.get('/api/:method.:format', function(req, res){

		var format = '';
		switch(req.param('format')){
			case 'json':
				res.contentType('application/json');
				format = 'json';
				break;
			default:
				res.send('Invalid response format: '+req.param('format'), 400);
				return;
		}

		//utils.log('API GET: '+req.param('method'));

		switch(req.param('method')){
			case 'list_maps':
				gs.maps_list(function(maps){
					var ret = {
						'ok' : true,
						'maps': {}
					};

					for (var i=0; i<maps.length; i++){
						ret.maps[maps[i].id] = maps[i].name;
					}

					res.send(JSON.stringify(ret));
				});
				break;

			case 'list_map_players':
				var id = req.query.id;
				gs.maps_list_players(id, function(players){

					var ret = {
						'ok' : true,
						'players': players
					};
					res.send(JSON.stringify(ret));
				});
				break;

			///
			default:
				res.send(JSON.stringify({ok: false, error: 'Invalid method: '+req.param('method')}), 400);
				return;
		}
	});
}

exports.handle = handle;