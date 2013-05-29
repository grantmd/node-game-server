var players = require('./players');
var maps = require('./maps');
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

		maps.handle(self);
		players.handle(self);

		utils.log('GS: Loading maps');

		//
		// Loop over all maps and load into memory
		// TODO: Load players here
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

				//
				// Check for other players at this position
				//


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

		// TODO: The contents of these functions are available to the caller, but should not be?
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

			apiGetPlayersHere: function(callback){
				self.maps_list_players(p.map_id, function(players){
					var other_players = [];
					for (var i=0; i<players.length; i++){
						if (players[i].id == id) continue;
						other_players.push(players[i]);
					}
					if (callback && typeof callback == 'function') callback(other_players);
				});
			},

			////
			apiGetMapBounds: function(){
				return {
					width: map.width || 0,
					height: map.height || 0,
					depth: map.depth || 0
				};
			},

			////
			// TODO: This should not be publicized, or maybe a null uop in "production" because there's no point for regular users
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
