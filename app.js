#!/usr/bin/nodejs
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
 * @author     Grégory Saive <greg@evias.be>
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       http://github.com/evias/pacNEM
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	path = require('path'),
	handlebars = require("handlebars"),
	expressHbs = require("express-handlebars"),
	auth = require("http-auth"),
	mongoose = require("mongoose"),
	bodyParser = require("body-parser");

// core dependencies
var logger = require('./core/logger.js'),
	__room = require('./core/room/room.js'),
	Room = __room.Room,
	RoomManager = require('./core/room/room_manager.js').RoomManager;

var __smartfilename = path.basename(__filename);

var serverLog = function(req, msg, type)
{
	var logMsg = "[" + type + "] " + msg + " (" + (req.headers ? req.headers['x-forwarded-for'] : "?") + " - "
			   + (req.connection ? req.connection.remoteAddress : "?") + " - "
			   + (req.socket ? req.socket.remoteAddress : "?") + " - "
			   + (req.connection && req.connection.socket ? req.connection.socket.remoteAddress : "?") + ")";
	logger.info(__smartfilename, __line, logMsg);
};

// configure view engine
app.engine(".hbs", expressHbs({
	extname: ".hbs",
	defaultLayout: "default.hbs",
	layoutPath: "views/layouts"}));
app.set("view engine", "hbs");

// configure body-parser usage for POST API calls.
app.use(bodyParser.urlencoded({ extended: true }));

/**
 * Basic HTTP Authentication
 *
 * COMMENT BLOCK if you wish to open the website
 * to the public.
 */
var basicAuth = auth.basic({
    realm: "This is a Highly Secured Area - Monkey at Work.",
    file: __dirname + "/pacnem.htpasswd"
});
app.use(auth.connect(basicAuth));
/**
 * End Basic HTTP Authentication BLOCK
 */

var models = require('./core/db/models.js');
var dataLayer = new models.pacnem(io);

/**
 * Frontend Web Application Serving
 *
 * Following routes define several entry points
 * like / and /scores.
 */
app.get("/", function(req, res)
	{
		serverLog(req, "Welcome", "START");
		res.render("play");
	});

app.get("/scores", function(req, res)
	{
		res.render("scores");
	});

/**
 * API Routes
 *
 * Following routes are used for handling the business
 * layer and managing the data layer.
 *
 * localStorage does not need any API requests to be
 * executed, only the database synchronization needs
 * these API endpoints.
 *
 * The sponsoring feature will also be built using API
 * routes.
 */
app.post("/api/v1/session/store", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var input = {
			"xem" : req.body.xem,
			"username" : req.body.username,
			"score": req.body.score,
			"type": req.body.type,
			"sid": req.body.sid
		};

		dataLayer.NEMGamer.findOne({"xem": input.xem}, function(err, player)
		{
			if (! err && player) {
			// update mode
				var highScore = input.score > player.highScore ? input.score : player.highScore;

				player.username  = input.username;
				player.xem 		 = input.xem;
				player.lastScore = input.score;
				player.highScore = highScore;

				if (! player.socketIds || ! player.socketIds.length)
					player.socketIds = [input.sid];
				else {
					var sockets = player.socketIds;
					sockets.push(input.sid);

					player.socketIds = sockets;
				}

				player.save();

				res.send(JSON.stringify(player));
			}
			else if (! player) {
			// creation mode
				var player = new dataLayer.NEMGamer({
					username: input.user,
					xem: input.xem,
					lastScore: input.score,
					highScore: input.score,
					countGames: 0,
					socketIds: [input.sid]
				});
				player.save();

				res.send(JSON.stringify(player));
			}
			else {
			// error mode
				var errorMessage = "Error occured on NEMGamer update: " + err;

				serverLog(req, errorMessage, "ERROR");
				res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}
		});
	});

/**
 * Static Files Serving
 *
 * Following routes define static files serving routes
 * such as the CSS, JS and images files.
 */
app.get('/favicon.ico', function(req, res)
	{
		res.sendfile(__dirname + '/static/favicon.ico');
	})
.get('/img/:image', function(req, res)
	{
		res.sendfile(__dirname + '/img/' + req.params.image);
	})
.get('/css/style.css', function(req, res)
	{
		res.sendfile(__dirname + '/static/css/style.css');
	})
.get('/js/:source.js', function(req, res)
	{
		res.sendfile(__dirname + '/static/js/' + req.params.source + '.js');
	});

/**
 * Socket.IO RoomManager implementation
 *
 * The following code block defines Socket.IO room
 * event listeners.
 *
 * Following Socket Events are implemented:
 * 	- disconnect
 * 	- change_username
 * 	- join_room
 * 	- create_room
 * 	- leave_room
 * 	- run_game
 * 	- cancel_game
 * 	- start
 * 	- keydown
 *
 * @link https://github.com/dubzzz/js-pacman
 */
var room_manager = new RoomManager(io);

io.sockets.on('connection', function(socket)
{
	logger.info(__smartfilename, __line, '[' + socket.id + '] ()');
	room_manager.register(socket.id);

	// Unregister the socket from the underlying RoomManager
	socket.on('disconnect', function () {
		logger.info(__smartfilename, __line, '[' + socket.id + '] ~()');
		room_manager.disconnect(socket.id);
	});

	// Rename the user
	socket.on('change_username', function(username) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] change_username(' + username + ')');
		room_manager.changeUsername(socket.id, username);
	});

	// Join an existing room
	socket.on('join_room', function(room_id) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] join_room(' + room_id + ')');
		room_manager.joinRoom(socket.id, room_id);
	});

	// Create a new room
	socket.on('create_room', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] create_room()');
		room_manager.createRoom(socket.id);
	});

	// Leave a room
	socket.on('leave_room', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] leave_room()');
		room_manager.leaveRoom(socket.id);
	});

	// Acknowledge room membership
	socket.on('ack_room', function(room_id) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] ack_room(' + room_id + ')');
		room_manager.ackRoomMember(socket.id, room_id);
	});

	// Ask to launch the game inside the room
	// The game will not start immediately and other members can cancel its launch
	socket.on('run_game', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] run_game()');
		var room = room_manager.getRoom(socket.id);
		if (room) {
			room.runGame();
		}
	});

	// Cancel game
	socket.on('cancel_game', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] cancel_game()');
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			logger.warn(__smartfilename, __line, 'Room is not defined for ' + socket.id);
			return;
		}
		room.cancelGame();
	});

	// Start the game
	socket.on('start', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] start()');
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			logger.warn(__smartfilename, __line, 'Room is not defined for ' + socket.id);
			return;
		}
		room.startGame(socket.id);
	});

	// Update the direction of the player
	socket.on('keydown', function(keycode) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] keydown(' + keycode + ')');
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			return;
		}

		if (keycode == 37) {
			room.receiveKeyboard(socket.id, __room.LEFT);
		} else if (keycode == 38) {
			room.receiveKeyboard(socket.id, __room.UP);
		} else if (keycode == 39) {
			room.receiveKeyboard(socket.id, __room.RIGHT);
		} else if (keycode == 40) {
			room.receiveKeyboard(socket.id, __room.DOWN);
		}
	});

	socket.on("notify", function()
	{
		logger.info(__smartfilename, __line, '[' + socket.id + '] notify()');
		room_manager.notifyChanges(socket.id);
	});
});

/**
 * Now listen for connections on the Web Server.
 *
 * This starts the NodeJS server and makes the Game
 * available from the Browser.
 */
var port = process.env['PORT'] = process.env.PORT || 2908;
server.listen(port, function()
    {
        console.log("PacNEM Game Server listening on Port %d in %s mode", this.address().port, app.settings.env);
    });
