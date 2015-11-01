/*globals define, Promise*/
/*jslint nomen: true */

define(['Phaser', 'lodash', 'dungeon', 'ROT'], function (Phaser, _, Dungeon, ROT) {
    'use strict';

    // Dictionary of tilesheet indexes
    var tiles = Dungeon.tiles,
        // Creature types
        creatures = Dungeon.creatures,
        // How wide / tall each tile is
        TILE_SIZE = Dungeon.TILE_SIZE,
        // Our ROT-based dungeon model
        dungeon = Dungeon.dungeon,
        // Width / height of the actual window
        // TODO: Completely fill window with game screen?
        DUNGEON_WIDTH = dungeon.width * TILE_SIZE,
        DUNGEON_HEIGHT = dungeon.width * TILE_SIZE,

        INPUT_DELAY = 80,

        // Phaser map where tiles are drawn
        map,
        // A distinct graphical layer on the map
        // TODO: Use multiple layers for tiles, objects, and creatures
        layer,

        // Arrow keys
        cursors,
        // Key to start a new game [R]
        reset_key,
        // Key that when held, moves the player towards the end of the level [A]
        autopilot_key,
        // Key to go fullscreen
        fullscreen_key,
        // Key to Pause game
        pause_key,
        // Square that follows mouse
        marker,

        // TODO: Make a player/creature variable
        // Currently automatically moving?
        is_pathing = false,

        // Dictionary of door sprites by (x,y)
        doors = {},
        monsters = [],
        //These variables are for volume control.
        //TODO: Allow user to choose volume.
        sound_volume = 0.4,
        music_volume = 0.1,
        //Sounds
        SND_door_open,
        SND_teleport,
        //Music
        MUS_dungeon1,
        MUS_dungeon2,
        
        Game = {
            create: function () {
                // // Increase bounds so camera can move outside the map boundaries
                this.world.setBounds(-DUNGEON_WIDTH, -DUNGEON_HEIGHT,
                    DUNGEON_WIDTH * 3,
                    DUNGEON_HEIGHT * 3);

                this.stage.backgroundColor = '#050505';

                // Creates a blank tilemap
                map = this.add.tilemap(null, TILE_SIZE, TILE_SIZE);

                // Add a Tileset image to the map
                map.addTilesetImage('dungeon');

                // Creates a new blank layer and sets the map dimensions.
                layer = map.create('level1',
                    dungeon.width,
                    dungeon.height,
                    TILE_SIZE,
                    TILE_SIZE);

                this.createWorld();

                cursors = this.input.keyboard.createCursorKeys();

                autopilot_key = this.input.keyboard.addKey(Phaser.Keyboard.A);

                reset_key = this.input.keyboard.addKey(Phaser.Keyboard.R);
                reset_key.onDown.add(this.createWorld, this);

                fullscreen_key = this.input.keyboard.addKey(Phaser.Keyboard.F);
                fullscreen_key.onDown.add(this.gofull, this);
                this.scale.fullScreenScaleMode = Phaser.ScaleManager.SHOW_ALL;

                // Our painting marker
                marker = this.add.graphics();
                marker.lineStyle(2, '#050505', 1);
                marker.drawRect(0, 0, 32, 32);

                this.input.addMoveCallback(this.updateMarker, this);
                this.input.onDown.add(this.mouseClicked, this);

                // Create Sounds
                SND_door_open = this.add.audio('SND_door_open');
                SND_teleport = this.add.audio('SND_teleport');
                SND_teleport.volume = SND_door_open.volume = sound_volume;

                // Create Music
                MUS_dungeon1 = this.add.audio('MUS_dungeon1');
                MUS_dungeon1.loop = true;
                MUS_dungeon1.volume = music_volume;
                MUS_dungeon1.play();
                MUS_dungeon2 = this.add.audio('MUS_dungeon2');
                MUS_dungeon2.loop = true;
                MUS_dungeon2.volume = music_volume;
            },

            updateMarker: function () {
                marker.x = layer.getTileX(this.input.activePointer.worldX) * 32;
                marker.y = layer.getTileY(this.input.activePointer.worldY) * 32;
            },

            mouseClicked: function () {
                // Cancel current path, if there is one
                if (is_pathing) {
                    is_pathing = false;
                    return;
                }
                // Standard procedure
                var x = layer.getTileX(this.input.activePointer.worldX),
                    y = layer.getTileY(this.input.activePointer.worldY);

                is_pathing = true;

                this.moveToTile(x, y);
            },

            // Attempt to traverse the entire path to (x, y)
            moveToTile: function (x, y) {
                if (dungeon.player.isMoving ||
                        (dungeon.player.x === x && dungeon.player.y === y) ||
                        dungeon.tiles[x + ',' + y] === undefined ||
                        is_pathing === false) {
                    is_pathing = false;
                    return;
                }

                // Recursively move towards the tile
                this.moveTowardsTile(x, y).then(function () {
                    Game.moveToTile(x, y);
                });
            },

            // Move one step towards (x, y), if it is a valid tile
            moveTowardsTile: function (x, y) {
                return new Promise(function (resolve, reject) {
                    if (dungeon.player.isMoving ||
                            dungeon.tiles[x + ',' + y] === undefined) {
                        resolve();
                        return;
                    }

                    // Input callback informs about map structure
                    var passableCallback = function (x, y) {
                            return (dungeon.tiles[x + "," + y] !== undefined);
                        },

                        // Prepare path towards tile
                        astar = new ROT.Path.AStar(x, y, passableCallback, {
                            topology: 4
                        }),

                        count = 0;

                    // Compute from player
                    astar.compute(dungeon.player.x,
                        dungeon.player.y,
                        function ($x, $y) {
                            count += 1;
                            // Only move once
                            if (count === 2) {
                                var _x = $x - dungeon.player.x,
                                    _y = $y - dungeon.player.y;

                                Game.movePlayer(_x, _y).then(function () {
                                    // If we bumped the goal tile, stop 
                                    // (e.g. bump to open a door, but don't walk into it after)
                                    // This will be very useful to avoid 
                                    // clicking a monster and infinitely attacking it
                                    if ($x === x && $y === y) {
                                        is_pathing = false;
                                    }

                                    resolve();
                                });
                            }
                        });
                });
            },

            // Move player one step towards the stairs (used to test pathing)
            autoPilot: function () {
                this.moveTowardsTile(dungeon.stairs.x, dungeon.stairs.y);
            },

            createWorld: function () {
                dungeon.level = 1;

                if (dungeon.player !== undefined) {
                    dungeon.player.sprite.destroy();
                }

                this.createDungeon();
                this.createPlayer();
            },

            placeTile: function (tile, x, y) {
                map.putTile(tile, x, y, layer);
            },

            createDungeon: function () {
                is_pathing = false;

                this.removeTiles();

                dungeon._init();

                // Place tiles
                _.each(dungeon.tiles, function (tile, key) {
                    var xy = key.split(',');
                    Game.placeTile(tile, xy[0], xy[1]);
                });

                // Place walls
                _.each(dungeon.walls, function (tile, key) {
                    var xy = key.split(',');
                    Game.placeTile(tile, xy[0], xy[1]);
                });

                // Place doors
                _.each(dungeon.doors, function (key) {
                    var xy = key.split(','),
                        door = Game.add.sprite(xy[0] *
                            TILE_SIZE, xy[1] *
                            TILE_SIZE, 'door', 0);

                    // Door of a vertical wall?
                    if (dungeon.tiles[(+xy[0] + 1) + ',' + (+xy[1])] !== undefined &&
                            dungeon.tiles[(+xy[0] - 1) + ',' + (+xy[1])] !== undefined) {
                        door.frame = 1;
                    }
                    doors[key] = door;
                });

                // Place monsters
                dungeon.monsters.forEach(function (monster) {
                    monster.sprite = Game.add.sprite(monster.x * TILE_SIZE,
                        monster.y * TILE_SIZE,
                        monster.sprite,
                        monster.frame);
                });

                // Place stairs
                this.placeTile(tiles.stairs, dungeon.stairs.x, dungeon.stairs.y);
            },

            createPlayer: function () {
                // TODO: Fully implement class system
                var playerClass = ['warrior', 'engineer', 'mage', 'paladin', 'rogue'][_.random(4)];

                dungeon.player.sprite = this.add.sprite(dungeon.player.x * TILE_SIZE,
                    dungeon.player.y * TILE_SIZE,
                    playerClass, 0);
                dungeon.player.sprite.animations.add('left', [4, 5, 6, 7], 10, true);
                dungeon.player.sprite.animations.add('right', [8, 9, 10, 11], 10, true);
                dungeon.player.sprite.animations.add('up', [12, 13, 14, 15], 10, true);
                dungeon.player.sprite.animations.add('down', [0, 1, 2, 3], 10, true);

                this.camera.follow(dungeon.player.sprite);
            },

            // Clear the map of all tiles
            removeTiles: function () {
                // Tiles
                _.each(dungeon.tiles, function (tile, key) {
                    var xy = key.split(',');
                    map.removeTile(xy[0], xy[1], layer);
                });

                // Walls
                _.each(dungeon.walls, function (tile, key) {
                    var xy = key.split(',');
                    map.removeTile(xy[0], xy[1], layer);
                });

                // Doors
                _.each(doors, function (sprite, key) {
                    sprite.destroy();
                });

                // Monsters
                if (dungeon.monsters) {
                    dungeon.monsters.forEach(function (monster) {
                        monster.sprite.destroy();
                    });
                }

                doors = {};
                monsters = [];
            },

            // Add (x, y) to the player's position if it is a valid move
            movePlayer: function (x, y) {
                return new Promise(function (resolve, reject) {
                    if (dungeon.player.isMoving || (x === 0 && y === 0)) {
                        resolve();
                        return;
                    }

                    var newX = dungeon.player.x + x,
                        newY = dungeon.player.y + y,

                        key = newX + ',' + newY,
                        door;

                    if (x === 1) {
                        dungeon.player.sprite.play('right');
                    } else if (x === -1) {
                        dungeon.player.sprite.play('left');
                    }
                    if (y === 1) {
                        dungeon.player.sprite.play('down');
                    } else if (y === -1) {
                        dungeon.player.sprite.play('up');
                    }

                    // Valid tile
                    if (dungeon.tiles[key] !== undefined) {

                        dungeon.player.isMoving = true;

                        if (_.contains(dungeon.doors, key)) {
                            // Remove the door from the model
                            dungeon.doors.splice(dungeon.doors.indexOf(key), 1);
                            // Change door's appearance to open
                            door = doors[key];
                            door.loadTexture('door_open', door.frame);

                            SND_door_open.play();
                            // Add delay to move again
                            setTimeout(function () {
                                dungeon.player.isMoving = false;
                                resolve();
                            }, INPUT_DELAY);
                            return;
                        }

                        dungeon.player.x += x;
                        dungeon.player.y += y;

                        // Entering stairs
                        if (dungeon.player.x === dungeon.stairs.x &&
                                dungeon.player.y === dungeon.stairs.y) {
                            // TODO: Swap stairs out with a portal?
                            is_pathing = false;
                            SND_teleport.play();
                            dungeon.level += 1;
                            Game.createDungeon();

                            if (dungeon.level > 5) {
                                if (MUS_dungeon2.isPlaying === false) {
                                    MUS_dungeon1.stop();
                                    MUS_dungeon2.play();
                                }
                            }
                        }

                        // Slide the player to their new position
                        Game.add.tween(dungeon.player.sprite).to({
                            x: dungeon.player.x * TILE_SIZE,
                            y: dungeon.player.y * TILE_SIZE
                        }, INPUT_DELAY, Phaser.Easing.Quadratic.InOut, true).onComplete.add(function () {
                            dungeon.player.isMoving = false;
                            resolve();
                        },  this);
                    } else {
                        resolve();
                    }
                });
            },

            gofull: function () {

                if (this.scale.isFullScreen) {
                    this.scale.stopFullScreen();
                } else {
                    this.scale.startFullScreen(false);
                }

            },

            // Handle input / animations
            update: function () {
                if (cursors.left.isDown) {
                    is_pathing = false;
                    this.movePlayer(-1, 0);
                } else if (cursors.right.isDown) {
                    is_pathing = false;
                    this.movePlayer(1, 0);
                } else if (cursors.up.isDown) {
                    is_pathing = false;
                    this.movePlayer(0, -1);
                } else if (cursors.down.isDown) {
                    is_pathing = false;
                    this.movePlayer(0, 1);
                } else if (autopilot_key.isDown) {
                    is_pathing = false;
                    this.autoPilot();
                } else {
                    if (!dungeon.player.isMoving) {
                        dungeon.player.sprite.animations.stop();
                    }
                }
            },

            // Where each frame is rendered
            render: function () {
                //this.debug.text('Level ' + dungeon.level, 16, 30);
                //this.debug.text('Use the ARROW KEYS to move', 16, this.height - 90);
                //this.debug.text('Press R to start a new game', 16, this.height - 60);
                //this.debug.text('Hold A for auto-pilot', 16, this.height - 30);
            }
        };

    return Game;
});