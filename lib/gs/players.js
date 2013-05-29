//
// Players
//

function handle(gs){
	gs.players_add = function(data, callback){
		var self = this;
		self.redis.incr('player_id', function (err, id) {
			if (!data.name){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Player needs a name'});
				return;
			}

			var player = {
				id: id
			};

			for (var i in data){
				player[i] = data[i];
			}

			self.redis.set('player:'+id, JSON.stringify(player), function(err) {
				//utils.log('GS: Player '+player.id+' added');

				self.active_players[player.id] = player;

				self.players_move_maps(player.id, 0, player.map_id);

				//
				// Start their ticks, handle other notifications
				//

				self.start_player_tick(player);

				if (callback && typeof callback == 'function') callback({ok: true, id: id});
			});
		});
	};

	// 'player' is an entire player object, so make sure you have one or you will lose everything else!
	gs.players_edit = function(id, player, callback){
		var self = this;
		self.redis.get('player:'+id, function(err, data){
			var p = JSON.parse(data);
			if (!p || !p.name){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid player'});
				return;
			}

			player.id = id;
			self.redis.set('player:'+id, JSON.stringify(player), function(err) {
				//utils.log('GS: Player '+player.id+' updated');

				self.active_players[player.id] = player;

				//
				// Move maps?
				//

				if (player.map_id != p.map_id){
					self.players_move_maps(player.id, player.map_id, p.map_id);
				}

				//
				// Restart their ticks, if it changed
				//

				if (player.onTick != p.onTick){
					self.start_player_tick(player);
				}

				if (callback && typeof callback == 'function') callback({ok: true, id: id});
			});
		});
	};

	gs.players_get = function(id, callback){
		var self = this;

		// Check in-memory storage first
		var p = self.players_get_active(id);
		if (p){
			if (callback && typeof callback == 'function') callback(p);
			return;
		}

		self.redis.get('player:'+id, function(err, data){
			if (callback && typeof callback == 'function') callback(JSON.parse(data));
		});
	};

	// Returns from the in-memory copy directly
	gs.players_get_active = function(id){
		return this.active_players[id];
	};

	gs.players_get_multi = function(player_ids, callback){
		var self = this;

		var ids = [];
		for (var i=0; i<player_ids.length; i++){
			ids.push('player:'+player_ids[i]);
		}

		self.redis.mget(ids, function(err, data){
			var players = [];
			for (var i in data){
				if (!data[i]) continue;
				players.push(JSON.parse(data[i].toString()));
			}

			if (callback && typeof callback == 'function') callback(players);
		});
	};

	gs.players_list = function(callback){
		var self = this;
		self.redis.get('player_id', function(err, id){
			var ids = [];
			for (var i=1; i<=id; i++){
				ids.push('player:'+i);
			}

			self.redis.mget(ids, function(err, data){
				var players = [];
				for (var i in data){
					if (!data[i]) continue;
					players.push(JSON.parse(data[i].toString()));
				}

				if (callback && typeof callback == 'function') callback(players);
			});
		});
	};

	gs.players_delete = function(id, callback){
		var self = this;
		self.players_get(id, function(player){
			if (!player || !player.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid player'});
				return;
			}

			self.redis.del('player:'+id, function(err){
				self.players_move_maps(id, player.map_id, 0);

				//
				// cancel their ticks
				//

				delete self.active_players[id];
				self.cancel_player_tick(id);

				if (callback && typeof callback == 'function') callback({ok: true});
			});
		});
	};

	gs.players_move_maps = function(id, from_id, to_id, callback){
		var self = this;
		self.players_get(id, function(player){
			if (!player || !player.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid player'});
				return;
			}

			if (from_id && to_id){
				// Move maps
				self.maps_move_player(id, from_id, to_id, callback);
			}
			else if (from_id){
				// Delete from map
				self.maps_delete_player(id, from_id, callback);
			}
			else if (to_id){
				// Add to map
				self.maps_add_player(id, to_id, callback);
			}
			else{
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid maps'});
				return;
			}
		});
	};
}

exports.handle = handle;