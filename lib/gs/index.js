var utils = require('../utils');

var GS = exports = module.exports = function GS(){
	var self = this;
	
	this.redis_connected = false;
	//console.log('GS: Connecting to Redis');
	this.redis = require("redis").createClient();
	
	this.active_players = {};
	this.player_intervals = {};
	this.player_scripts = {};	

	//
	// Load all active players and start their ticks
	//
	
	this.start = function(){
		console.log('GS: Loading players');

		//
		// Loop over all players and schedule their onTicks
		//

		self.players_list(function(players){
			for (var i in players){
				self.active_players[players[i].id] = players[i];
				self.start_player_tick(players[i]);
			}
			
			console.log('GS: Players loaded');
		});
		
	};
	
	
	//
	// (Re)Start a player's onTick and store references to their compiled and sandboxed scripts
	//
	
	this.start_player_tick = function(player){
		self.cancel_player_tick(player.id);
		
		if (!player.onTick) return;
		
		var Script = process.binding('evals').Script;
		var scriptObj = new Script(player.onTick, 'player_'+player.id+'.js');

		//
		// Set up their sandbox
		//
		
		// TODO: Is player.id protected enough here?
		var sandbox = utils.copy(self.player_context(player.id));
		
		//
		// Schedule it
		//
		
		// TODO: This should probably be wrapped in a runner function that handles timeouts and/or locking to ensure the ticks don't stack
		var intervalId = setInterval(function(){
			try{
				scriptObj.runInNewContext(sandbox);
			}
			catch(e){
				console.log('GS: Player '+player.id+' exception: '+e);
			}
		}, 1000);
		console.log('GS: Player '+player.id+' onTick scheduled');
		self.player_intervals[player.id] = intervalId;
		
		//
		// Stash their compiled script for possible re-use
		//
		
		if (!self.player_scripts[player.id]) self.player_scripts[player.id] = {};
		self.player_scripts[player.id].onTick = scriptObj;
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
		return {			
			////
			apiMove: function(x, y, z){
				// TODO: Check that this is legal according to the rules of the map
				
				var p = self.players_get_active(id);
				p.x = x;
				p.y = y;
				p.z = z;
				
				self.players_edit(id, p);
			},
		
			apiGetPos: function(){
				var p = self.players_get_active(id);
				return {
					x: p.x || 0,
					y: p.y || 0,
					z: p.z || 0
				};
			},
		
			apiStore: function(key, value){
				self.redis.set('player:storage:'+id+':'+key, JSON.stringify(value));
			},
		
			apiGet: function(key, callback){
				self.redis.get('player:storage:'+id+':'+key, function(err, data){
					// What do we do with err???
					
					if (callback && typeof callback == 'function') callback(JSON.parse(data));
				});
			},
		
			////
			log: function(msg){
				console.log('GS: PLAYER LOG ('+id+'): '+msg);
			}
		};
	};
	
	
	////////////////////////////////////////////
	
	//
	// Redis events
	//
	
	this.redis.on("connect", function(){
		console.log('GS: Redis connected');
		self.redis_connected = true;
	});
	
	this.redis.on("error", function(exception){
		console.log('GS: Redis error: '+exception);
	});
	
	this.redis.on("end", function(){
		console.log('GS: Redis disconnected');
		self.redis_connected = false;
	});
};

// TODO: Put these functions in players.js
GS.prototype.players_add = function(data, callback){
	var self = this;
	self.redis.incr('player_id', function (err, id) {
		if (!data.name){
			if (callback && typeof callback == 'function') callback({ok: false, error: 'Player needs a name'});
			return;	
		}
		
		var player = {
			id: id,
			name: data.name,
			onTick: data.onTick || ''
		};
		
		self.redis.set('player:'+id, JSON.stringify(player), function(err) {
			//
			// Start their ticks, handle other notifications
			//
			
			self.active_players[player.id] = player;
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
			//
			// Restart their ticks
			//
			
			self.active_players[player.id] = player;
			self.start_player_tick(player);
			
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
			//
			// cancel their ticks
			//
			
			delete self.active_players[id];
			self.cancel_player_tick(id);
			
			if (callback && typeof callback == 'function') callback({ok: true});
		});
	});
};

// Make things simple for callers
exports.createServer = function(){
	return new GS();
};