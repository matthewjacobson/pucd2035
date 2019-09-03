let string = 'read';

let canvas;
let font;
let fontData;
let boundingBox;
let paths;
let walls;
let floodSize;

function getBezierPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
	let output = [];
	let steps = 5;
	let xMin = x1;
	let xMax = x1;
	let yMin = y1;
	let yMax = y1;
	for (let i = 0; i <= steps; i++) {
		let t = i / steps;
		let x = bezierPoint(x1, x2, x3, x4, t);
		let y = bezierPoint(y1, y2, y3, y4, t);
		if (x < xMin) xMin = x;
		if (x > xMax) xMax = x;
		if (y < yMin) yMin = y;
		if (y > yMax) yMax = y;
		output.push({x: x, y: y});
	}
	return {points: output, xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax};
}

function getPathOutline(cmds) {
	// output to store the paths
	let output = [];
	// current pen position
	let cx = 0;
	let cy = 0;
	// start position of current contour
	let startX = 0;
	let startY = 0;
	// store the bounding box
	let xMin = cmds[0].x;
	let xMax = cmds[0].x;
	let yMin = cmds[0].y;
	let yMax = cmds[0].y;
	// store the current path
	let currPath = [];
	for (let cmd of cmds) {
		switch (cmd.type) {
			case 'M': // move to
				startX = cmd.x;
				startY = cmd.y;
				cx = cmd.x;
				cy = cmd.y;
				currPath = [{x: cx, y: cy}];
				if (cx < xMin) xMin = cx;
				if (cx > xMax) xMax = cx;
				if (cy < yMin) yMin = cy;
				if (cy > yMax) yMax = cy;
				break;
			case 'L': // line to
				currPath.push({x: cmd.x, y: cmd.y});
				if (cmd.x < xMin) xMin = cmd.x;
				if (cmd.x > xMax) xMax = cmd.x;
				if (cmd.y < yMin) yMin = cmd.y;
				if (cmd.y > yMax) yMax = cmd.y;
				cx = cmd.x;
				cy = cmd.y;
				break;
			case 'C': // curve to
				let curve = getBezierPoints(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
				currPath = currPath.concat(curve.points);
				if (curve.xMin < xMin) xMin = curve.xMin;
				if (curve.xMax > xMax) xMax = curve.xMax;
				if (curve.yMin < yMin) yMin = curve.yMin;
				if (curve.yMax > yMax) yMax = curve.yMax;
				cx = cmd.x;
				cy = cmd.y;
				break;
			case 'Q': // quad to
				let quad = getBezierPoints(cx, cy, cmd.x1, cmd.y1, cmd.x1, cmd.y1, cmd.x, cmd.y);
				currPath = currPath.concat(quad.points);
				if (quad.xMin < xMin) xMin = quad.xMin;
				if (quad.xMax > xMax) xMax = quad.xMax;
				if (quad.yMin < yMin) yMin = quad.yMin;
				if (quad.yMax > yMax) yMax = quad.yMax;
				cx = cmd.x;
				cy = cmd.y;
				break;
			case 'Z': // close
				line(cx, cy, startX, startY);
				currPath.push({x: startX, y: startY});
				if (startX < xMin) xMin = startX;
				if (startX > xMax) xMax = startX;
				if (startY < yMin) yMin = startY;
				if (startY > yMax) yMax = startY;
				output.push(currPath);
				break;
		}
	}
	return {paths: output, xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax};
}

function preload() {
	fontData = loadBytes('assets/font.ttf');
}

function getWalls() {
	walls = [];
	let xOffset = boundingBox.x + boundingBox.w / 2;
	let yOffset = boundingBox.y + boundingBox.h / 2;
	let padding = 0.8;
	let scale = Math.min(padding * windowWidth / boundingBox.w, padding * windowHeight / boundingBox.h);
	for (let i = 0; i < paths.length; i++) {
		for (let j = 0; j < paths[i].length - 1; j++) {
			let x1 = scale * (paths[i][j].x - xOffset) + windowWidth / 2;
			let y1 = scale * (paths[i][j].y - yOffset) + windowHeight / 2;
			let x2 = scale * (paths[i][j + 1].x - xOffset) + windowWidth / 2;
			let y2 = scale * (paths[i][j + 1].y - yOffset) + windowHeight / 2;
			walls.push({x1: x1, y1: y1, x2: x2, y2: y2});
		}
	}
}

function lineLineIntersection(l1, l2) {
	let diffLA = {x: l1.x2 - l1.x1, y: l1.y2 - l1.y1};
	let diffLB = {x: l2.x2 - l2.x1, y: l2.y2 - l2.y1};
	let compareA = diffLA.x * l1.y1 - diffLA.y * l1.x1;
	let compareB = diffLB.x * l2.y1 - diffLB.y * l2.x1;
	let check1 = (diffLA.x * l2.y1 - diffLA.y * l2.x1) < compareA;
	let check2 = (diffLA.x * l2.y2 - diffLA.y * l2.x2) < compareA;
	let check3 = (diffLB.x * l1.y1 - diffLB.y * l1.x1) < compareB;
	let check4 = (diffLB.x * l1.y2 - diffLB.y * l1.x2) < compareB;
	if ((check1 ^ check2) && (check3 ^ check4)) {
		let lDetDivInv = 1 / ((diffLA.x * diffLB.y) - (diffLA.y * diffLB.x));
		let x = -((diffLA.x * compareB) - (compareA * diffLB.x)) * lDetDivInv;
		let y = -((diffLA.y * compareB) - (compareA * diffLB.y)) * lDetDivInv;
		return {bIntersect: true, x: x, y: y};
	} else {
		return {bIntersect: false};
	}
}

function getRayCast(ray, levels) {
	let hit = false;
	let intersections = [{bHit: false, dist: dist(ray.x, ray.y, ray.x + ray.dx, ray.y + ray.dy), intersection: {x: ray.x + ray.dx, y: ray.y + ray.dy}}];
	let intersect = {x: ray.x + ray.dx, y: ray.y + ray.dy};
	let rayLine = {x1: ray.x, y1: ray.y, x2: ray.x + ray.dx, y2: ray.y + ray.dy};
	let minDist = dist(ray.x, ray.y, ray.x + ray.dx, ray.y + ray.dy);
	for (let i = 0; i < walls.length; i++) {
		let checkIntersect = lineLineIntersection(rayLine, walls[i]);
		if (checkIntersect.bIntersect) {
			hit = true;
			let currDist = dist(ray.x, ray.y, checkIntersect.x, checkIntersect.y);
			intersections.push({bHit: true, dist: currDist, intersection: {x: checkIntersect.x, y: checkIntersect.y}});
			if (currDist < minDist) {
				minDist = currDist;
				intersect = {x: checkIntersect.x, y: checkIntersect.y};
			}
		}
	}
	intersections.sort((a, b) => a.dist - b.dist);
	let output = [];
	for (let i = 0; i < levels; i++) {
		output.push(intersections[Math.min(intersections.length - 1, i)]);
	}
	return output;
}

function setup() {
	canvas = createCanvas(windowWidth, windowHeight, WEBGL);
	canvas.position(0, 0);
	canvas.style('z-index', '-1');
	font = opentype.parse(fontData.bytes.buffer);
	let outline = getPathOutline(font.getPath(string, 0, 0, 72).commands);
	paths = outline.paths;
	boundingBox = {x: outline.xMin, y: outline.yMin, w: outline.xMax - outline.xMin, h: outline.yMax - outline.yMin};
	getWalls();
	floodSize = 0.5 * Math.min(windowWidth, windowHeight);
}

function getFlood(pos, levels) {
	let flood = [];
	for (let i = 0; i < levels; i++) {
		let level = [];
		flood.push(level);
	}
	let countSamples = 50;
	for (let i = 0; i < countSamples; i++) {
		let angle = 2 * Math.PI * i / countSamples - Math.PI;
		let ray = {x: pos.x, y: pos.y, dx: floodSize * Math.cos(angle), dy: floodSize * Math.sin(angle)};
		let cast = getRayCast(ray, levels);
		for (let l = 0; l < levels; l++) {
			flood[l].push({angle: angle, x: cast[l].intersection.x, y: cast[l].intersection.y});
		}
	}
	for (let i = 0; i < walls.length; i++) {

		let angle1 = Math.atan2(walls[i].y1 - pos.y, walls[i].x1 - pos.x);
		let ray1 = {x: pos.x, y: pos.y, dx: floodSize * Math.cos(angle1), dy: floodSize * Math.sin(angle1)};
		let cast1 = getRayCast(ray1, levels);
		for (let l = 0; l < levels; l++) {
			flood[l].push({angle: angle1, x: cast1[l].intersection.x, y: cast1[l].intersection.y});
		}

		let angle2 = Math.atan2(walls[i].y2 - pos.y, walls[i].x2 - pos.x);
		let ray2 = {x: pos.x, y: pos.y, dx: floodSize * Math.cos(angle2), dy: floodSize * Math.sin(angle2)};
		let cast2 = getRayCast(ray2, levels);
		for (let l = 0; l < levels; l++) {
			flood[l].push({angle: angle2, x: cast2[l].intersection.x, y: cast2[l].intersection.y});
		}

		let angleLeft = Math.atan2(walls[i].y1 - pos.y, walls[i].x1 - pos.x) - 0.1;
		let rayLeft = {x: pos.x, y: pos.y, dx: floodSize * Math.cos(angleLeft), dy: floodSize * Math.sin(angleLeft)};
		let castLeft = getRayCast(rayLeft, levels);
		for (let l = 0; l < levels; l++) {
			flood[l].push({angle: angleLeft, x: castLeft[l].intersection.x, y: castLeft[l].intersection.y});
		}
		let angleRight = Math.atan2(walls[i].y1 - pos.y, walls[i].x1 - pos.x) + 0.1;
		let rayRight = {x: pos.x, y: pos.y, dx: floodSize * Math.cos(angleRight), dy: floodSize * Math.sin(angleRight)};
		let castRight = getRayCast(rayRight, levels);
		for (let l = 0; l < levels; l++) {
			flood[l].push({angle: angleRight, x: castRight[l].intersection.x, y: castRight[l].intersection.y});
		}
	}
	for (let l = 0; l < levels; l++) {
		flood[l].sort((a, b) => a.angle - b.angle);
	}
	return flood;
}

function draw() {
	background(0);
	stroke(255);
	translate(-windowWidth / 2, -windowHeight / 2);
// 	for (let i = 0; i < walls.length; i++) {
// 		line(walls[i].x1, walls[i].y1, walls[i].x2, walls[i].y2);
// 	}
	noStroke();
	let blurRadius = 10;
	let blurCount = 0;
	let floodLevels = 5;
 	for (let i = -1; i < blurCount; i++) {
 		let x = mouseX;
 		let y = mouseY;
 		if (i >= 0) {
	 		let angle = 2 * Math.PI * i / blurCount;
	 		x = mouseX + blurRadius * cos(angle);
	 		y = mouseY + blurRadius * sin(angle);
	 	}
	 	let flood = getFlood({x: x, y: y}, floodLevels);
	 	for (let l = floodLevels - 1; l >= 0; l--) {
	 		beginShape(TRIANGLE_FAN);
	 			fill(255 / (l + 1));
	 			vertex(mouseX, mouseY);
	 			for (let i = 0; i < flood[l].length; i++) {
	 				let distance = dist(mouseX, mouseY, flood[l][i].x, flood[l][i].y);
	 				fill(map(distance, 0, floodSize, 255 / (l + 1), 0));
		 			vertex(flood[l][i].x, flood[l][i].y);
		 		}
				let distance = dist(mouseX, mouseY, flood[l][0].x, flood[l][0].y);
				fill(map(distance, 0, floodSize, 255 / (l + 1), 0));
		 		vertex(flood[l][0].x, flood[l][0].y);
	 		endShape(CLOSE);
	 	}
 	}
}

function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
	getWalls();
}

function mouseClicked() {
	
}

function mouseWheel(event) {
	let minWindowSize = Math.min(windowWidth, windowHeight);
	floodSize = Math.max(50, Math.min(minWindowSize, floodSize + Math.max(-10, Math.min(10, event.delta))));
}

function keyPressed() {

}
