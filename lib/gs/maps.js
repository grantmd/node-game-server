//
// Maps
//

function handle(gs){
	gs.maps_list = function(callback){
		var self = this;
		self.redis.get('map_id', function(err, id){
			var ids = [];
			for (var i=1; i<=id; i++){
				ids.push('map:'+i);
			}

			self.redis.mget(ids, function(err, data){
				var maps = [];
				for (var i in data){
					if (!data[i]) continue;
					maps.push(JSON.parse(data[i].toString()));
				}

				if (callback && typeof callback == 'function') callback(maps);
			});
		});
	};

	gs.maps_get = function(id, callback){
		var self = this;

		// Check in-memory storage first
		var p = self.maps_get_active(id);
		if (p){
			if (callback && typeof callback == 'function') callback(p);
			return;
		}

		self.redis.get('map:'+id, function(err, data){
			if (callback && typeof callback == 'function') callback(JSON.parse(data));
		});
	};

	// Returns from the in-memory copy directly
	gs.maps_get_active = function(id){
		return this.maps[id];
	};

	gs.maps_add = function(data, callback){
		var self = this;
		self.redis.incr('map_id', function (err, id){

			var map = {
				id: id
			};

			for (var i in data){
				map[i] = data[i];
			}

			self.redis.set('map:'+id, JSON.stringify(map), function(err){

				self.maps[map.id] = map;

				if (callback && typeof callback == 'function') callback({ok: true, id: id});
			});
		});
	};

	// 'map' is an entire map object, so make sure you have one or you will lose everything else!
	gs.maps_edit = function(id, map, callback){
		var self = this;
		self.redis.get('map:'+id, function(err, data){
			var m = JSON.parse(data);
			if (!m){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid map'});
				return;
			}

			map.id = id;
			self.redis.set('map:'+id, JSON.stringify(map), function(err) {

				self.maps[map.id] = player;

				if (callback && typeof callback == 'function') callback({ok: true, id: id});
			});
		});
	};

	gs.maps_delete = function(id, callback){
		var self = this;
		self.maps_get(id, function(map){
			if (!map || !map.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid map'});
				return;
			}

			self.redis.del('map:'+id, function(err){

				delete self.map[id];

				if (callback && typeof callback == 'function') callback({ok: true});
			});
		});
	};

	gs.maps_list_players = function(map_id, callback){
		var self = this;
		self.maps_get(map_id, function(map){
			if (!map || !map.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid map'});
				return;
			}

			// Check in-memory storage first
			var p = self.map_members[map_id];
			if (p){
				self.players_get_multi(p, callback);
				return;
			}

			self.redis.smembers('map_players:'+map_id, function(err, data){
				self.map_members[map_id] = data;
				self.players_get_multi(data, callback);
			});
		});
	};

	gs.maps_move_player = function(player_id, from_id, to_id, callback){
		var self = this;
		self.maps_get(from_id, function(map){
			if (!map || !map.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid from map'});
				return;
			}

			self.maps_get(to_id, function(map){
				if (!map || !map.id){
					if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid to map'});
					return;
				}

				self.redis.smove('map_players:'+from_id, 'map_players:'+to_id, player_id, function(err){

					if (self.map_members[from_id]) delete self.map_members[from_id][player_id];

					if (callback && typeof callback == 'function') callback({ok: true});
				});
			});
		});
	};

	gs.maps_delete_player = function(player_id, from_id, callback){
		var self = this;
		self.maps_get(from_id, function(map){
			if (!map || !map.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid map'});
				return;
			}

			self.redis.srem('map_players:'+from_id, player_id, function(err){

				if (self.map_members[from_id]) delete self.map_members[from_id][player_id];

				if (callback && typeof callback == 'function') callback({ok: true});
			});
		});
	};

	gs.maps_add_player = function(player_id, to_id, callback){
		var self = this;
		self.maps_get(to_id, function(map){
			if (!map || !map.id){
				if (callback && typeof callback == 'function') callback({ok: false, error: 'Invalid map'});
				return;
			}

			self.redis.sadd('map_players:'+to_id, player_id, function(err){

				if (!self.map_members[to_id]) self.map_members[to_id] = {};
				self.map_members[to_id][player_id] = player_id;

				if (callback && typeof callback == 'function') callback({ok: true});
			});
		});
	};
}

exports.handle = handle;