var utils = require('../utils');
var vm = require('vm');

var GS = exports = module.exports = function GS(config){
	var self = this;

	this.config = config;

	this.redis_connected = false;
	//utils.log('GS: Connecting to Redis');
	this.redis = require("redis").createClient();

	this.active_players = {};
	this.player_intervals = {};
	this.player_scripts = {};

	this.maps = {};
	this.map_members = {};

	//
	// Load all active players and start their ticks
	//

	this.start = function(){

		utils.log('GS: Loading maps');

		//
		// Loop over all maps and load into memort
		//

		self.maps_list(function(maps){
			for (var i in maps){
				self.maps[maps[i].id] = maps[i];
			}

			utils.log('GS: Maps loaded');
		});


		utils.log('GS: Loading players');

		//
		// Loop over all players and schedule their onTicks
		//

		self.players_list(function(players){
			for (var i in players){
				self.active_players[players[i].id] = players[i];
				self.start_player_tick(players[i]);
			}

			utils.log('GS: Players loaded');
		});

	};


	//
	// (Re)Start a player's onTick and store references to their compiled and sandboxed scripts
	//

	this.start_player_tick = function(player){
		self.cancel_player_tick(player.id);

		if (!player.onTick) return false;


		//
		// Set up their sandbox
		//

		// TODO: Is player.id protected enough here?
		var sandbox = utils.copy(self.player_context(player.id));


		//
		// Run it for the first time to make sure it's valid
		//

		utils.log('GS: Player '+player.id+' testing onTick');
		var scriptObj;
		try{
			scriptObj = vm.createScript(player.onTick, 'player_'+player.id+'.js');
			scriptObj.runInNewContext(sandbox);
		}
		catch(e){
			utils.log('GS: Player '+player.id+' exception: '+e);
			return false;
		}


		//
		// Schedule it
		//

		// TODO: This should probably be wrapped in a runner function that handles timeouts and/or locking to ensure the ticks don't stack
		// TODO: These should really be separate processes
		var intervalId = setInterval(function(){
			try{
				scriptObj.runInNewContext(sandbox);
			}
			catch(e){
				utils.log('GS: Player '+player.id+' exception: '+e);
			}
		}, self.config.tick_interval);
		utils.log('GS: Player '+player.id+' onTick scheduled for '+self.config.tick_interval);
		self.player_intervals[player.id] = intervalId;


		//
		// Stash their compiled script for possible re-use
		//

		if (!self.player_scripts[player.id]) self.player_scripts[player.id] = {};
		self.player_scripts[player.id].onTick = scriptObj;

		return true;
	};

	this.cancel_player_tick = function(id){
		if (self.player_intervals[id]){
			clearInterval(self.player_intervals[id]);
			delete self.player_intervals[id];
		}
	};


	////////////////////////////////////////////

	//
	// The context in which player objects are run
	//

	this.player_context = function(id){
		// TODO: Load into memory if not already loaded
		var p = self.players_get_active(id);
		var map = this.maps_get_active(p.map_id);

		return {
			////
			apiMove: function(x, y, z){

				// Can't move more than one space in either direction at a time
				if (Math.abs(p.x-x) > 1) return false;
				if (Math.abs(p.y-y) > 1) return false;
				if (Math.abs(p.z-z) > 1) return false;

				// Check that this is legal according to the rules of the map
				if (Math.abs(x) > map.width) return false;
				if (Math.abs(y) > map.height) return false;
				if (Math.abs(z) > map.depth) return false;

				// Move the player
				p.x = x;
				p.y = y;
				p.z = z;

				self.players_edit(id, p);

				return true;
			},

			apiGetPos: function(){
				return {
					x: p.x || 0,
					y: p.y || 0,
					z: p.z || 0
				};
			},

			apiStore: function(key, value){
				self.redis.set('player:storage:'+id+':'+key, JSON.stringify(value));

				return true;
			},

			apiGet: function(key, callback){
				self.redis.get('player:storage:'+id+':'+key, function(err, data){
					// What do we do with err???

					if (callback && typeof callback == 'function') callback(JSON.parse(data));
				});
			},

			////
			log: function(msg){
				utils.log('GS: PLAYER LOG ('+id+'): '+msg);
			}
		};
	};


	////////////////////////////////////////////

	//
	// Redis events
	//

	this.redis.on("connect", function(){
		utils.log('GS: Redis connected');
		self.redis_connected = true;
	});

	this.redis.on("error", function(exception){
		utils.log('GS: Redis error: '+exception);
	});

	this.redis.on("end", function(){
		utils.log('GS: Redis disconnected');
		self.redis_connected = false;
	});
};

// Make things simple for callers
exports.createServer = function(config){
	return new GS(config);
};

//
// Players
//
// TODO: Put these functions in players.js
//

GS.prototype.players_add = function(data, callback){
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
GS.prototype.players_edit = function(id, player, callback){
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

GS.prototype.players_get = function(id, callback){
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
GS.prototype.players_get_active = function(id){
	return this.active_players[id];
};

GS.prototype.players_get_multi = function(player_ids, callback){
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

GS.prototype.players_list = function(callback){
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

GS.prototype.players_delete = function(id, callback){
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

GS.prototype.players_move_maps = function(id, from_id, to_id, callback){
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

//
// Maps
//
// TODO: Put these functions in maps.js
//

GS.prototype.maps_list = function(callback){
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

GS.prototype.maps_get = function(id, callback){
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
GS.prototype.maps_get_active = function(id){
	return this.maps[id];
};

GS.prototype.maps_add = function(data, callback){
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
GS.prototype.maps_edit = function(id, map, callback){
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

GS.prototype.maps_delete = function(id, callback){
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

GS.prototype.maps_list_players = function(map_id, callback){
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

GS.prototype.maps_move_player = function(player_id, from_id, to_id, callback){
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

GS.prototype.maps_delete_player = function(player_id, from_id, callback){
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

GS.prototype.maps_add_player = function(player_id, to_id, callback){
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