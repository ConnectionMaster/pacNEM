/**
 * Part of the evias/pacNEM package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/pacNEM
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @contributor Nicolas Dubien (https://github.com/dubzzz)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 * @link       https://github.com/dubzzz/js-pacman
 */

(function() {

var assert = require('assert');

var pc = require('../pacman/configuration.js');
var Game = require('../pacman/game.js').Game;

var Room = function(io, manager, withMembers) 
{
	assert(io);
	assert(manager);

	Room.STATUS_JOIN = 0;
	Room.STATUS_WAIT = 1;
	Room.STATUS_PLAY = 2;

	Room.WAIT_TIME_MS = 10000;

	Room.MAX_NUM_PLAYERS = 4;

	var io = io;
	var self = this;
	var manager_ = manager;

	var status_ = Room.STATUS_JOIN;
	var members_   = [];
	var addresses_ = {};
	var usernames_ = {};
	var game_ = undefined;
	var timeout_run_ = undefined;
	var has_waited_ = 0;

	// Serialize current object for JSON export
	// @return dictionary representing the room
	this.toDictionary = function() {
		return {
			'status': status_ == Room.STATUS_JOIN
				? 'join'
				: (status_ == Room.STATUS_WAIT
					? 'wait'
					: 'play'),
			'wait': status_ == Room.STATUS_WAIT ? (Room.WAIT_TIME_MS-has_waited_)/1000 : 0,
			'users': members_,
			'addresses': addresses_,
			'usernames': usernames_,
			'is_full': self.isFull()
		};
	};

	// Does the Room contain members?
	// @return true if the room does not have any members
	this.isEmpty = function() {
		return members_.length == 0;
	};

	// Does the room is fully populated?
	// @return true if the room is full
	this.isFull = function() {
		return members_.length == Room.MAX_NUM_PLAYERS;
	};

	// Instantiate a Game
	// Launch the game session
	var realRunGame = function() {
		has_waited_ += 1000;
		if (has_waited_ < Room.WAIT_TIME_MS) {
			for (var i = 0 ; i != members_.length ; i++) {
				manager.notifyChanges(members_[i]);
			}
			timeout_run_ = setTimeout(realRunGame, 1000);
			return;
		}

		assert.equal(status_, Room.STATUS_WAIT);
		assert(members_.length);
		assert(members_.length <= 4);

		status_ = Room.STATUS_PLAY;
		game_ = new Game(io, members_, self);
		game_.refresh();

		manager.notifyChanges();
	};

	// Run a new game session
	// The game is not started immediately and can still be canceled by other players of the room
	// during Room.WAIT_TIME_MS ms
	// @warning makes a call to manager.notifyChanges
	// 			please keep in mind to keep a stable state for manager when calling this method
	this.runGame = function() {
		assert.equal(status_, Room.STATUS_JOIN);
		assert(members_.length);
		assert(members_.length <= 4);

		status_ = Room.STATUS_WAIT;
		has_waited_ = 0;
		timeout_run_ = setTimeout(realRunGame, 1000);

		manager.notifyChanges();
	};

	// Cancel the Game (before it started)
	// @warning makes a call to manager.notifyChanges
	// 			please keep in mind to keep a stable state for manager when calling this method
	this.cancelGame = function() {
		assert.equal(status_, Room.STATUS_WAIT);
		assert(timeout_run_);

		clearTimeout(timeout_run_);
		status_ = Room.STATUS_JOIN;

		manager.notifyChanges();
	};

	// Transfer the start message directly towards the Game
	this.startGame = function(sid) {
		var id = members_.indexOf(sid);
		assert.notEqual(id, -1);
		assert.equal(status_, Room.STATUS_PLAY);
		assert(game_);

		game_.start(id);
	};

	// Add a player to the Room (if and only if the room is not already full)
	// Throw an assert if the player if already in the room
	// @return true if the player was successfully added
	this.join = function(sid, details) {
		assert.equal(status_, Room.STATUS_JOIN);

		if (self.isFull()) {
			return false;
		}

		if (members_.indexOf(sid) === -1)
			members_.push(sid);

		usernames_[sid] = details.username;
		addresses_[sid] = details.address;

		return true;
	};

	// Remove a player from the room
	this.leave = function(sid) {
		var id  = members_.indexOf(sid);
		assert.notEqual(id, -1);

		if (status_ == Room.STATUS_WAIT) {
			self.cancelGame();
		} else if (status_ == Room.STATUS_PLAY) {
			assert(game_);
			game_.quit();
			delete game_;
			game_ = undefined;
			status_ = Room.STATUS_JOIN;
			manager.notifyChanges();
		}
		members_.splice(id, 1);
		delete addresses_[sid];
		delete usernames_[sid];
	};

	this.getAddress = function(sid)
	{
		assert(addresses_.hasOwnProperty(sid));

		return addresses_[sid];
	};

	this.getUsername = function(sid)
	{
		assert(usernames_.hasOwnProperty(sid));

		return usernames_[sid];
	};

	// Notification to re-open the room in join mode
	// after the end of the game
	this.notifyEnd = function() {
		assert.equal(status_, Room.STATUS_PLAY);
		assert(game_);

		delete game_;
		game_ = undefined;
		status_ = Room.STATUS_JOIN;
		manager.notifyChanges();
	};

	// Send arrows to the game
	this.receiveKeyboard = function(sid, arrow) {
		var id = members_.indexOf(sid);
		assert.notEqual(id, -1);

		if (status_ == Room.STATUS_PLAY) {
			game_.setPacmanDirection(arrow, id);
		}
	};

	{
		if (typeof withMembers != 'undefined') {
			var sids = Object.getOwnPropertyNames(withMembers);
			for (var i in sids) {
				var sid = sids[i];
				var details = withMembers[sid];

				members_.push(sid);
				usernames_[sid] = details.username;
				addresses_[sid] = details.address;
			}
		}
	}
};

module.exports.Room = Room;
module.exports.LEFT = pc.LEFT;
module.exports.RIGHT = pc.RIGHT;
module.exports.UP = pc.UP;
module.exports.DOWN = pc.DOWN;
}());

