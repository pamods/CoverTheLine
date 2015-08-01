(function() {
	console.log("loaded cover the line");
	
	var scaleMouseEvent = function(mdevent) {
		if (mdevent.uiScaled)
			return;
		mdevent.uiScaled = true;
		var scale = api.settings.getSynchronous('ui', 'ui_scale') || 1.0;
		mdevent.offsetX = Math.floor(mdevent.offsetX * scale);
		mdevent.offsetY = Math.floor(mdevent.offsetY * scale);
		mdevent.clientX = Math.floor(mdevent.clientX * scale);
		mdevent.clientY = Math.floor(mdevent.clientY * scale);
	};
	
	var unitTypes = undefined;
	unitInfoParser.loadUnitTypeMapping(function(data) {
		unitTypes = data;
	});
	var isMobile = function(spec) {
		return unitTypes[spec].indexOf("Mobile") !== -1;
	};
	
	var baseEngine = engine.call;
	var hookEngineCall = function(callName, handler) {
		var oldEngineCall = engine.call;
		engine.call = function() {
			if (arguments && arguments[0] === callName) {
				return handler.apply(this, arguments);
			} else {
				return oldEngineCall.apply(this, arguments);
			}
		};
	};
	
	var world = api.getWorldView(0);
	
	var getSelectedMobiles = function() {
		var selection = model.selection();
		if (selection) {
			var result = [];
			_.forEach(selection.spec_ids, function(elem, key) {
				if (isMobile(key) && elem.length > 0) {
					for (var i = 0; i < elem.length; i++) {
						result.push(elem[i]);
					}
				}
			});
			return result;
		} else {
			return [];
		}
	};

	var distSq = function(a, b) {
		var d0 = a[0]-b[0];
		var d1 = a[1]-b[1];
		var d2 = a[2]-b[2];
		return d0*d0 + d1*d1 + d2*d2;
	};
	
	var dist = function(a, b) {
		return Math.sqrt(distSq(a, b));
	};
	
	var calcPathLength = function(input) {
		var length = 0;
		for (var i = 0; i < input.length-1; i++) {
			var a = input[i].pos;
			var b = input[i+1].pos;
			length += dist(a, b);
		}
		return length;
	};
	
	var vecLength = function(pos) {
		return Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]);
	};
	
	var normalizeVec = function(pos) {
		var l = vecLength(pos);
		return [(pos[0]/l), (pos[1]/l), (pos[2]/l)];
	};
	
	var addVec = function(a, b) {
		return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
	};

	var subVec = function(a, b) {
		return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
	};
	
	var scaleVec = function(a, s) {
		return [a[0] * s, a[1] * s, a[2] * s];
	};
	
	var calcTargetPoints = function(targetsNum, inputLocs) {
		var pathLength = calcPathLength(inputLocs);
		var dPerUnit = pathLength / (targetsNum-1);
		var locs = [];
		
		var locCnt = 0;
		var current = inputLocs[locCnt].pos;
		var direction = normalizeVec(subVec(inputLocs[locCnt+1].pos, inputLocs[locCnt].pos));
		var distToNextP = dist(inputLocs[locCnt].pos, inputLocs[locCnt+1].pos);
		for (var i = 0; i < targetsNum; i++) {
			locs.push({
				pos: current
			});
			distToNextP -= dPerUnit;
			if (i + 1 < targetsNum) {
				if (distToNextP >= 0) {
					current = addVec(current, scaleVec(direction, dPerUnit));
				} else {
					var missing = Math.abs(distToNextP);
					do {
						if (locCnt+2 < inputLocs.length) {
							locCnt++;
						} else {
							break;
						}
						var d = dist(inputLocs[locCnt].pos, inputLocs[locCnt+1].pos);
						distToNextP += d;
						missing -= d;
					} while(distToNextP < 0);
					direction = normalizeVec(subVec(inputLocs[locCnt+1].pos, inputLocs[locCnt].pos));
					current = addVec(inputLocs[locCnt].pos, scaleVec(direction, missing));
				}
			}
		}
		return locs;
	};
	
	var calcLocalCoordinates = function(set) {
		if (set.length === 0) {
			return set;
		}
		
		if (set.length === 1) {
			set[0].local = [1, 1, 1];
			return set;
		}
		
		var maxX = set[0].pos[0];
		var minX = set[0].pos[0];
		var maxY = set[0].pos[1];
		var minY = set[0].pos[1];
		var maxZ = set[0].pos[2];
		var minZ = set[0].pos[2];
		for (var i = 1; i < set.length; i++) {
			var ix = set[i].pos[0];
			var iy = set[i].pos[1];
			var iz = set[i].pos[2];
			if (ix > maxX) {
				maxX = ix; 
			}
			if (ix < minX) {
				minX = ix;
			}
			
			if (iy > maxY) {
				maxY = iy;
			}
			if (iy < minY) {
				minY = iy;
			}
			
			if (iz > maxZ) {
				maxZ = iz;
			}
			if (iz < minZ) {
				minZ = iz;
			}
		}
		
		var lx = maxX - minX;
		var ly = maxY - minY;
		var lz = maxZ - minZ;
		
		var scale = 1/lx;
		var scaleSize = lx;
		if (scaleSize < ly) {
			scale = 1/ly;
			scaleSize = ly;
		}
		if (scaleSize < lz) {
			scale = 1/lz;
		}
		
		for (var i = 0; i < set.length; i++) {
			var ix = set[i].pos[0];
			var iy = set[i].pos[1];
			var iz = set[i].pos[2];
			var rx = ix - minX;
			var ry = iy - minY;
			var rz = iz - minZ;
			set[i].local = [rx * scale, ry * scale, rz * scale];
		}
	};
	
	var takeClosestLocal = function(srcPoint, destSet) {
		var dSq = distSq(srcPoint, destSet[0].local);
		var index = 0;
		for (var i = 1; i < destSet.length; i++) {
			var iDsq = distSq(srcPoint, destSet[i].local);
			if (iDsq < dSq) {
				dSq = iDsq;
				index = i;
			}
		}
		
		return destSet.splice(index, 1)[0];
	};
	
	// pretty sure this is not really perfect but it looks decent...
	// two steps, both O(n^2). The 2nd step is a non mandatory optimization that runs at most 150ms
	var matchPoints = function(src, dest) {
		calcLocalCoordinates(src);
		calcLocalCoordinates(dest);
		
		var dcp = [];
		for (var i = 0; i < dest.length; i++) {
			dcp.push(dest[i]);
		}
		
		for (var i = 0; i < src.length; i++) {
			src[i].target = takeClosestLocal(src[i].local, dcp);
		}
		
		var time = Date.now();
		for (var i = 0; i < src.length; i++) {
			var swapWin = 0;
			var swapI = 0;
			var swapJ = 0;
			for (var j = 0; j < src.length; j++) {
				if (i != j) {
					var costNoSwp = distSq(src[i].pos, src[i].target.pos) + distSq(src[j].pos, src[j].target.pos);
					var costSwp = distSq(src[i].pos, src[j].target.pos) + distSq(src[j].pos, src[i].target.pos);
					var win = costNoSwp - costSwp;
					if (win > swapWin) {
						swapWin = win;
						swapI = i;
						swapJ = j;
					}
				}
			}
			if (swapWin > 0) {
				var tmp = src[swapI].target;
				src[swapI].target = src[swapJ].target;
				src[swapJ].target = tmp;
			}
			if (Date.now() - 150 >= time) {
				console.log("stopped optimizing point matching: out of time");
				break;
			}
		}
	};
	
	var lineIsRelevant = function(locs2D) {
		var sum = 0;
		for (var i = 0; i < locs2D.length-1; i++) {
			var a = locs2D[i];
			var b = locs2D[i+1];
			var dx = a.x-b.x;
			var dy = a.y-b.y;
			sum += dx*dx + dy*dy;
		}
		return sum > 1000;
	};
	
	var setPositionToLastOrderLoc = function(unitLocs) {
		for (var i = 0; i < unitLocs.length; i++) {
			var unit = unitLocs[i];
			if (unit.orders && unit.orders.length > 0) {
				var op = unit.orders[unit.orders.length-1].target.position;
				if (op) {
					unit.pos = op;
				}
			}
		}
	};
	
	var coverLine = function(locs2D, queue, hdeckId) {
		var holodeck = api.holodecks[hdeckId];
		if (!lineIsRelevant(locs2D)) {
			console.log("drag not relevant for cover line, giving single command");
			holodeck.unitGo(locs2D[0].x, locs2D[0].y, queue);
		} else {
			var selection = getSelectedMobiles();
			world.getUnitState(selection).then(function(unitLocs) {
				holodeck.raycastTerrain(locs2D).then(function(locs3D) {
					try {
						var tmp = locs3D;
						locs3D = [];
						for (var i = 0; i < tmp.length; i++) {
							if (tmp[i].pos) {
								locs3D.push(tmp[i]);
							}
						}
						if (queue) {
							setPositionToLastOrderLoc(unitLocs);
						}
						matchPoints(unitLocs, calcTargetPoints(selection.length, locs3D));
						for (var i = 0; i < selection.length; i++) {
							var unit = selection[i];
							var order = {
								units: [unit],
								command: 'move',
								location: {
									planet: unitLocs[i].planet || 0,
									pos: unitLocs[i].target.pos
								},
								queue: queue
							}
							world.sendOrder(order).then(function(r) {
								if (r !== true) {
									console.log(r);
								}
							});
						}
					} catch (e) {
						console.log(e.stack);
					}
				});
			});
		}
	};
	
	var showsPreview = false;
	var previewPuppetsIds = [];

	var cleanPreview = function() {
		showsPreview = false;
		_.forEach(previewPuppetsIds, function(elem) {
			world.unPuppet(elem);
		});
		previewPuppetsIds = [];
	};
	
	var addPreviewAtLoc = function(loc) {
		var hdeck = api.holodecks[activeHolodeck];
		hdeck.raycastTerrain(loc.x, loc.y).then(function(loc3D) {
			if (loc3D.pos) {
				world.puppet({
					model:{
						"filename": "/pa/units/land/land_mine/land_mine.papa"
					},
					material: {
						shader: 'pa_unit_ghost',
						constants: {
							Color: [1,0,1,0.8],
							GhostColor: [0,0,1,0.5],
							BuildInfo: [0, 10, 0, 0]
						}
					},
					location: {
						planet: loc3D.planet || 0,
						pos: loc3D.pos,
						orient_rel: true,
						snap: true
					}
				}, true).then(function(p) {
					previewPuppetsIds.push(p.id);
				});
			}
		});
	};
	
	var previewActive = false;
	var activeHolodeck = undefined;
	var locations = [];
	
	var oldCapture = input.capture;
	input.capture = function(e, h) {
		var result = oldCapture(e, h);
		locations = [];
		if (model.hasSelection()) {
			$(".input_capture").mousemove(function(event) {
				scaleMouseEvent(event);
				var l = {x: event.offsetX, y: event.offsetY};
				locations.push(l);
				if (previewActive) {
					if (showsPreview || lineIsRelevant(locations)) {
						if (!showsPreview) {
							showsPreview = true;
							for (var i = 0; i < locations.length; i++) {
								addPreviewAtLoc(locations[i]);
							}
						} else {
							addPreviewAtLoc(l);
						}
					}
				}
			});
		}
		return result;
	};
	
	hookEngineCall("holodeck.unitBeginGo", function(engineCall, hdeckId, x, y, custom) {
		activeHolodeck = hdeckId;
		return {
			then: function(h) {
				if (model.hasSelection()) {
					previewActive = true;
					h("coverline");
				}
			}
		};
	});
	
	hookEngineCall("holodeck.unitEndCommand", function(engineCall, hdeckId, cmd, x, y, queue) {
		if (cmd === "coverline") {
			if (model.hasSelection()) {
				previewActive = false;
				coverLine(locations, queue, hdeckId);
				setTimeout(cleanPreview, 500);
			}
			return {
				then: function(h) {
					h(false);
					model.mode("default");
				}
			}
		} else {
			return baseEngine('holodeck.unitEndCommand', hdeckId, cmd, x, y, queue);
		}
	});
}());