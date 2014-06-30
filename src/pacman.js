// Draw parameters
var pc_SIZE = 16;

// Legend:
//  #: wall
//   : no cheese
//  .: cheese
//  o: big cheese
//  s: starting point
//  g: ghost starting point
//  _: forbidden for player
var pc_grid_template = [
	"############################",
	"#............##............#",
	"#.####.#####.##.#####.####.#",
	"#o####.#####.##.#####.####o#",
	"#.####.#####.##.#####.####.#",
	"#..........................#",
	"#.####.##.########.##.####.#",
	"#.####.##.########.##.####.#",
	"#......##....##....##......#",
	"######.#####.##.#####.######",
	"######.#####.##.#####.######",
	"######.##..........##.######",
	"######.##.###__###.##.######",
	"######.##.#gggggg#.##.######",
	"      ....#gggggg#....      ",
	"######.##.#gggggg#.##.######",
	"######.##.########.##.######",
	"######.##..........##.######",
	"######.##.########.##.######",
	"######.##.########.##.######",
	"#............##............#",
	"#.####.#####.##.#####.####.#",
	"#o####.#####.##.#####.####o#",
	"#...##.......s........##...#",
	"###.##.##.########.##.##.###",
	"###.##.##.########.##.##.###",
	"#......##....##....##......#",
	"#.##########.##.##########.#",
	"#.##########.##.##########.#",
	"#..........................#",
	"############################",
];
var pc_grid = [];

var pc_LEFT = 0;
var pc_TOP = 1;
var pc_RIGHT = 2;
var pc_BOTTOM = 3;
var pc_FPS = 20;
var pc_FRAMES_PER_CELL = 5;

/**
 * User position
 */

var pc_pacman_x = -1;
var pc_pacman_y = -1;
var pc_pacman_direction = pc_LEFT;
var pc_pacman_next_direction = pc_LEFT;
var pc_current_frame = -1;

/**
 * Initialize the game
 */

function initGame() {
	// Already launched?
	if (pc_pacman_x != -1 || pc_pacman_y != -1 || pc_current_frame != -1)
		return;
	pc_pacman_direction = pc_LEFT;
	pc_pacman_next_direction = pc_LEFT;
	pc_current_frame = 0;

	// Copy the grid into local grid
	pc_grid = pc_grid_template.slice();

	// Find the starting point
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	for (i=0 ; i!=width ; i++) {
		for (j=0 ; j!=height ; j++) {
			if (pc_grid[j][i] == 's') {
				pc_pacman_x = i * pc_FRAMES_PER_CELL;
				pc_pacman_y = j * pc_FRAMES_PER_CELL;
			}
		}
	}
	
	// Resize canvas
	var canvas = document.getElementById('myCanvas');
	if (! canvas.getContext)
		return;
	var ctx = canvas.getContext('2d');
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	canvas.width = width*pc_SIZE +10;
	canvas.height = height*pc_SIZE +10;
	
	// Launch the game
	iterateGame();
}

/**
 * Iterate inside the game
 */

function iterateGame() {
	var canvas = document.getElementById('myCanvas');
	if (! canvas.getContext)
		return;
	var ctx = canvas.getContext('2d');
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	
	// Move characters
	if (pc_pacman_direction == pc_LEFT) {
		pc_pacman_x--;
		// out of the grid
		if (pc_pacman_x < 0)
			pc_pacman_x = (width -1) * pc_FRAMES_PER_CELL;
		// into a wall
		else if (isForbiddenForPacMan(pc_grid[pc_pacman_y/pc_FRAMES_PER_CELL][Math.floor(1.*pc_pacman_x/pc_FRAMES_PER_CELL)]))
			pc_pacman_x++;
	} else if (pc_pacman_direction == pc_TOP) {
		pc_pacman_y--;
		// out of the grid
		if (pc_pacman_y < 0)
			pc_pacman_y = (height -1) * pc_FRAMES_PER_CELL;
		// into a wall
		else if (isForbiddenForPacMan(pc_grid[Math.floor(1.*pc_pacman_y/pc_FRAMES_PER_CELL)][pc_pacman_x/pc_FRAMES_PER_CELL]))
			pc_pacman_y++;
	} else if (pc_pacman_direction == pc_RIGHT) {
		pc_pacman_x++;
		// out of the grid
		if (pc_pacman_x > (width -1) * pc_FRAMES_PER_CELL)
			pc_pacman_x = 0;
		// into a wall
		else if (isForbiddenForPacMan(pc_grid[pc_pacman_y/pc_FRAMES_PER_CELL][Math.ceil(1.*pc_pacman_x/pc_FRAMES_PER_CELL)]))
			pc_pacman_x--;
	} else {
		pc_pacman_y++;
		// out of the grid
		if (pc_pacman_y > (height -1) * pc_FRAMES_PER_CELL)
			pc_pacman_y = 0;
		// into a wall
		else if (isForbiddenForPacMan(pc_grid[Math.ceil(1.*pc_pacman_y/pc_FRAMES_PER_CELL)][pc_pacman_x/pc_FRAMES_PER_CELL]))
			pc_pacman_y--;
	}

	// Draw game
	drawEmptyGameBoard(canvas, ctx);
	drawPacMan(canvas, ctx);
	
	pc_current_frame++;
	setTimeout(iterateGame, 1000/pc_FPS);
}

/**
 * Is forbidden for PacMan
 */

function isForbiddenForPacMan(cell_type) {
	return cell_type == "#" || cell_type == "g" || cell_type == "_";
}

/**
 * Draw an empty game board
 */

function drawEmptyGameBoard(canvas, ctx) {
	/**
	 * Draw the Game Board based on pc_grid
	 */

	// Retrieve grid dimensions
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	
	// Draw Game Board
	ctx.beginPath();
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width*pc_SIZE +10, height*pc_SIZE +10);
	ctx.fill();
	
	ctx.beginPath();
	ctx.lineWidth = 3;
	ctx.strokeStyle = "black";
	ctx.moveTo(2, 2);
	ctx.lineTo(2, height*pc_SIZE +8);
	ctx.lineTo(width*pc_SIZE +8, height*pc_SIZE +8);
	ctx.lineTo(width*pc_SIZE +8, 2);
	ctx.closePath();
	ctx.stroke();
	
	for (i=0 ; i!=width ; i++) {
		for (j=0 ; j!=height ; j++) {
			if (pc_grid[j][i] == '#') {
				ctx.fillStyle = "#777777";
				ctx.fillRect(i*pc_SIZE +5, j*pc_SIZE +5, pc_SIZE, pc_SIZE);
			} else if (pc_grid[j][i] == '.') {
				ctx.beginPath();
				ctx.fillStyle = "#aaaa00";
				ctx.arc((i+.5)*pc_SIZE +5, (j+.5)*pc_SIZE +5, .2*pc_SIZE, 0, 2*Math.PI, false);
				ctx.fill();
			} else if (pc_grid[j][i] == 'o') {
				ctx.beginPath();
				ctx.fillStyle = "#aaaa00";
				ctx.arc((i+.5)*pc_SIZE +5, (j+.5)*pc_SIZE +5, .4*pc_SIZE, 0, 2*Math.PI, false);
				ctx.fill();
			}
		}
	}
}

/**
 * Draw the PacMan
 */

function drawPacMan(canvas, ctx) {
	var pacman_px_x = (1.*pc_pacman_x/pc_FRAMES_PER_CELL +.5)*pc_SIZE +5;
	var pacman_px_y = (1.*pc_pacman_y/pc_FRAMES_PER_CELL +.5)*pc_SIZE +5;
	var pacman_mouth = pc_current_frame%pc_FRAMES_PER_CELL +3;

	ctx.beginPath();
	ctx.fillStyle = "#777700";
	if (pc_pacman_direction == pc_LEFT)
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, Math.PI+Math.PI/pacman_mouth, Math.PI-Math.PI/pacman_mouth,false);
	else if (pc_pacman_direction == pc_TOP)
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, -Math.PI/2+Math.PI/pacman_mouth, -Math.PI/2-Math.PI/pacman_mouth,false);
	else if (pc_pacman_direction == pc_RIGHT)
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, Math.PI/pacman_mouth, -Math.PI/pacman_mouth,false);
	else
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, Math.PI/2+Math.PI/pacman_mouth, Math.PI/2-Math.PI/pacman_mouth,false);
	ctx.lineTo(pacman_px_x, pacman_px_y);
	ctx.fill();
}
