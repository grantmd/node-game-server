function handle(server, gs){

	// Index page
	server.get('/', function(req, res){
		res.render('index', {
			locals: { title: 'Home' }
		});
	});

	// Players pages
	server.get('/players/:id?', function(req, res){
		if (req.params.id){
			// fetch player
			gs.players_get(req.params.id, function(player){
				if (player){
					res.render('player', {
						locals: { title: 'Player '+player.name, player: player }
					});
				}
				else{
					res.render('404', {
						locals: { title: 'Player not found!' }
					});
				}
			});
		}
		else{
			gs.players_list(function(players){				
				res.render('players', {
					locals: { title: 'Players', players: players }
				});
			});
		}
	});

	// Maps pages
	server.get('/maps/:id?', function(req, res){
		if (req.params.id){
			// fetch map
			gs.maps_get(req.params.id, function(map){
				res.render('map', {
					locals: { title: 'Map '+map.name, map: map }
				});
			});
		}
		else{
			gs.maps_list(function(maps){				
				res.render('maps', {
					locals: { title: 'Maps', maps: maps }
				});
			});
		}
	});
};

exports.handle = handle;