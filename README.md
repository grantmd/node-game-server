node-game-server
================

A game server that works for at least one specific game, in Node. Provides a web interface, http api, and a game logic runner. Intended initially as a proof-of-concept, may evolve into something that's actually useful!

Requirements
------------

* <a href="http://nodejs.org/">node</a>
* <a href="http://code.google.com/p/redis/">redis</a>
* <a href="http://expressjs.com/">express</a>

Components
----------

The game server handles logic by providing an interface between storage (redis) and game objects. Game objects can currently either be Maps or Players. All "active" game objects are kept in memory for easy direct access, but are persisted to redis at write time. See the documentation below for api methods available to these objects.

The web server is there to provide both a management interface to the game server and allow for a public api into the game.

Object API
----------

Objects are run sandboxed and do not have direct access to server code or other objects. The world is exposed to them through the following api:

### Players

Player objects can define handlers for several events:

* `onTick()` - Called every second since the player was instantiated (or reloaded).
* `onCollision(id)` - If the player object collides with another, this handler is called with the `id` of the colliding player.

Player objects can manipulate the world using these functions:

* `apiMove(x, y, z)` - Moves the player to the given position, if the map rules allow for it.
* `apiGetPos()` - Returns the player's current position as a hash with `x`, `y`, and `z` keys.

Additionally, player objects can store/retrieve arbitrary data in a private key/value store:

* `apiStore(key, value)` - `value` can be any data type.
* `apiGet(key, callback)` - Calls the function defined by `callback` with the `value` associated with `key`, or `undefined` if there is no data for `key`.

### Maps

TODO
----

* Authentication for the web server
* Lots more event handlers and api methods!
