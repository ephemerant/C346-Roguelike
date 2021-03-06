/*globals define, console*/
/*jslint nomen: true */

define(['ROT', 'Phaser', 'items', 'lodash', 'creator'], function (ROT, Phaser, items, _, creator) {
    'use strict';

    /**
     * @module creatures
     */
    return {
        _sprites: ['Reptile0.png', 'Reptile1.png', 'Undead0.png', 'Undead1.png', 'Humanoid0.png', 'Humanoid1.png'],
        _creatures_area1: ['skeleton', 'snake', 'fairy'], //Creature pool for area 1

        /**
         * Picks a random crature from the proper creature pool.
         *
         * @param  {number} level - What level of the dungeon the player is currently on
         * @return {string} The name of the creature that has been picked to be placed
         */
        _pickCreature: function (level) {
            if (level >= 1 && level <= 5) { //pick a random creature from section 1
                return this._creatures_area1[Math.floor(Math.random() * 3)];
            }
            return (this._creatures_area1[Math.floor(Math.random() * 3)]); //If calculation breaks then just return area1
        },

        /**
         * Creates a creature that is to be put into the dungeon. It calls the _pickCreature function to randomly select
         * a creature. This function creates the randomly chosen enemy and returns that creature.
         *
         * @param  {number} level   What level of the dungeon the player is currently on
         * @param  {number} x       X coordinate of where the creature is to be placed.
         * @param  {number} y       Y coordinate of where the creature is to be placed.
         * @return {creature}       The creature created is returned.
         */
        _putCreature: function (level, x, y) {
            var creatureName = this._pickCreature(level);
            if (creatureName === 'skeleton') {
                return this.skeleton(x, y, level);
            } else if (creatureName === 'fairy') {
                return this.fairy(x, y, level);
            } else {
                return this.snake(x, y, level); //If all else fails put snake
            }
        },

        /**
         * A factory that creates an enemy based upon the given data
         *
         * @param  {string} name    Creatures name
         * @param  {number} hp      Health will also become the max_hp
         * @param  {number} str     Strength
         * @param  {number} def     Defense
         * @param  {number} crit    Critical hit ratio
         * @param  {number} vision  View distance of creature
         * @param  {number} expgain Experience point gain
         * @param  {string} sprite  Sprite sheet name
         * @param  {number} frame   What frame from the spritesheet to use
         * @param  {number} dropchance       the chance that this creature will have an item. 1/dropchance.
         * @param  {number} x       X coordinate of where the sprite is located in the dungeon
         * @param  {number} y       Y coordinate of where the sprite is located in the dungeon
         * @param  {number} level       current dungeon floor
         * @return {creature}       The created creature object is returned to the caller
         */
        _generic: function (name, hp, str, def, crit, vision, expgain, sprite, frame, dropchance, x, y, level) {
            return {
                name: name,
                hp: hp,
                max_hp: hp,
                str: str,
                def: def,
                crit: crit,
                vision: vision,
                expgain: expgain,
                sprite: sprite,
                frame: frame,
                dropchance: dropchance,
                droppedItem: items.spawnDrop(name, dropchance, level),
                x: x,
                y: y,
                isDead: 0,
                /**
                 * Moves the changes the x and y coordinate of the creature
                 * @param  {number} _x      Tells the creature where to move relative to its current position
                 * @param  {number} _y      Tells the creature where to move relative to its current position
                 */
                move: function (_x, _y) {
                    if (this.isDead === 0) { //cannot move if dead
                        this.x += _x;
                        this.y += _y;
                    }
                },
                /**
                 * Performs any action that must be done upon death (ex. item drop)
                 */
                die: function () {},
                /**
                 * Performs any non attack action that the player may do to the creature (ex. talk)
                 */
                interact: function () {
                    //This function is for if the player runs into the creature without intent to attack.
                },

                /**
                 * Basic distance formula between two creatures
                 * @function tileDistance
                 * @param  {number} a
                 * @param  {number} b
                 * @return {number} distance
                 */
                distance: function (charX, charY, targetX, targetY) {
                    return Math.sqrt(Math.pow(charX - targetX, 2) + Math.pow(charY - targetY, 2));
                },

                nextToPlayer: function(dungeon) {
                    return (Math.abs(this.x - dungeon.player.x) == 1 && (this.y - dungeon.player.y) === 0) || (Math.abs(this.y - dungeon.player.y) == 1 && (this.x - dungeon.player.x) === 0);
                },

                /**
                 * For anything that needs to be called every turn
                 */
                turnTick: function (dungeon) {
                    // if (this.name === 'Skeleton' && this.isDead === 1) {
                    //     //Skeletons may revive each turn
                    //     var revive = Math.floor(Math.random() * 10);
                    //     if (revive === 1) {
                    //         this.isDead = 0;
                    //     }
                    // }
                    var result = {
                        moved: false,
                        damage: 0
                    };
                    // Attack the player if it's in an adjacent square
                    if (this.nextToPlayer(dungeon)) {
                        result.damage = this.attack(dungeon.playerStats);
                    }
                    // Check for player nearby
                    else if (this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y) <= vision) {
                        result.moved = true;
                        // Move Left
                        if (dungeon._isAvailable(this.x - 1, this.y) &&
                            this.distance(dungeon.player.x, dungeon.player.y, this.x - 1, this.y) <=
                            this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y)) {
                            this.x -= 1;
                        // Move Right
                        } else if (dungeon._isAvailable(this.x + 1, this.y) &&
                            this.distance(dungeon.player.x, dungeon.player.y, this.x + 1, this.y) <=
                            this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y)) {
                            this.x += 1;
                        // Move Up
                        } else if (dungeon._isAvailable(this.x, this.y - 1) &&
                            this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y - 1) <=
                            this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y)) {
                            this.y -= 1;
                        // Move Down
                        } else if (dungeon._isAvailable(this.x, this.y + 1) &&
                            this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y + 1) <=
                            this.distance(dungeon.player.x, dungeon.player.y, this.x, this.y)) {
                            this.y += 1;
                        }
                    } else { //wander around
                        var _x = _.random(-1, 1),
                            _y = _.random(-1, 1);
                        // Choose to keep either _x or _y
                        if (_.random(0, 1)) {
                            _y = 0;
                        } else {
                            _x = 0;
                        }
                        if (_.random(0, 1)) {
                            if (dungeon._isAvailable(this.x + _x, this.y + _y)) {
                                result.moved = true;
                                this.x += _x;
                                this.y += _y;
                            }
                        }
                    }

                    return result;

                },

                /**
                 * Perform a special creature specific action that isnt an attack. (ex. fairy teleport)
                 */
                special: function () {
                    //This is for any special move that the creature can perform, outside of the attack.
                },
                /**
                 * The creature attacks the creature that is passed to it. Calculations are made to determine damage given.
                 *
                 * @param  {creature} creature      The creature that is being attacked
                 * @return {number} How much damage was done
                 */
                attack: function (creature) {
                    //This is called when the creature attacks
                    var damage = this.str;
                    if (Math.random() * 10 < this.crit) {
                        damage *= 2; // Critical Hit double the damage.
                        console.log('CRITICAL HIT!');
                        if (this.name === 'Snake') {
                            creature.isPoisoned = 1;
                            creature.poisonTimer = 3;
                            console.log('Player poisoned');
                        }
                    }
                    damage -= creature.def; //remove player defense
                    damage -= creature.armor.def; // remove player armor from damage
                    // Ensure player always takes damage
                    if (damage < 1) {
                        damage = 1;
                    }
                    creature.hp -= damage;

                    console.log('Creature did ' + damage + ' damage');
                    console.log('Player health now ' + creature.hp);

                    if (creature.hp <= 0) {
                        creature.hp = 0;
                        creature.isDead = 1;
                        creature.frame = 0;
                    }
                    return damage;
                }
            };
        },

        /**
         * A factory that creates the player based upon the data given
         * @param  {string} name        Name is 'Player' !!DO NOT CHANGE THIS!!
         * @param  {number} hp          Health of the player, will also become the max_hp
         * @param  {number} str         Strength of the player
         * @param  {number} def         Defense of the player
         * @param  {number} crit        Critical hit ratio
         * @param  {number} vision      radius around the player that they can see
         * @param  {string} Class       Name of the class the player is
         * @return {creature}           Returns the created player to the caller
         */
        _makePlayer: function (name, hp, mp, str, def, crit, vision, charClass) {
            return {
                name: name,
                level: 1,
                exp: 0,
                hp: hp,
                max_hp: hp,
                mp: mp,
                max_mp: mp,
                str: str,
                def: def,
                crit: crit,
                vision: vision,
                class: charClass, //The class of the character 'rogue, warrior etc'
                isPoisoned: 0,
                poisonTimer: 0,
                isDead: 0, //Not sure if necessary
                inventory: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
                armor: items.WoodArmor(),
                weapon: items.StoneSpear(),
                /**
                 * The playerattacks the creature that is passed to it. Calculations are made to determine damage given.
                 * @param  {creature} creature        The creature that is being attacked
                 * @return {number} How much damage was done
                 */
                attack: function (creature) {
                    var damage = this.str;
                    if (Math.random() * 10 < this.crit) {
                        damage *= 2; // Critical Hit double the damage.
                        console.log('PLAYER CRITICAL HIT!');
                        if (creature.name === 'Skeleton') {
                            creature.hp = 0;
                        }
                    }
                    damage += this.weapon.str; //increase damage by weapon
                    damage -= creature.def; // decrease damage by creature defense
                    creature.hp -= damage;

                    console.log('Player did ' + damage + ' damage');
                    console.log('Monster health is now ' + creature.hp);

                    if (creature.hp <= 0) {
                        creature.hp = 0;
                        creature.isDead = 1;
                        creature.frame = 0;
                        this.exp += (creature.expgain - (this.level * 2));

                        if (this.exp >= 100) { //Leveling up system ;D
                            this.exp -= 100;
                            this.level += 1;
                            this.str += 2;
                            this.def += 1;
                            this.hp += 3;
                        }
                    }
                    return damage;
                },
                /**
                 * This is called every turn, used for poison and other checks
                 * that must be performed every turn
                 */
                turnTick: function () {
                    var result = {};

                    if (this.poisonTimer >= 1) {
                        this.poisonTimer -= 1;
                        this.hp -= 1;
                        result.poison = 1;
                        console.log('Player suffers from poison' + ' hp now ' + this.hp);
                        if (this.poisonTimer === 0) {
                            this.isPoisoned = 0;
                            console.log('Player no longer poisoned');
                        }
                    }
                    if (this.hp <= 0) {
                        this.hp = 0;
                        this.poisonTimer = 0;
                        this.isDead = 1;
                    }

                    return result;
                },

                /**
                 * Checks if the player has an empty spot in their inventory
                 *
                 * @return {number} Returns the index of free space if space is found and -1 if no space is found.
                 */
                checkInventorySpace: function () {
                    var i;
                    for (i = 0; i < this.inventory.length; i += 1) {
                        if (this.inventory[i] === 'none') {
                            return i;
                        }
                    }
                    return -1;
                },

                /**
                 * Puts the item in the players inventory if there is room
                 * @param  {item} item    the item to be picked up
                 * @return {number}      1 if the item was gotten, 0 if not
                 */
                pickup: function (item) {
                    var freespot = this.checkInventorySpace();
                    if (freespot !== -1) {
                        this.inventory[freespot] = item;
                        return 1;
                    }
                    return 0;
                }
            };
        },

        /**
         * Create a snake at (x, y)
         * @param  {number} x
         * @param  {number} y
         * @return {creature}
         */
        snake: function (x, y, level) {
            return this._generic('Snake', 10, 3, 1, 3, 3, 10, 'reptile0', 43, 5, x, y, level);
        },

        /**
         * Create a skeleton at (x, y)
         * @param  {number} x
         * @param  {number} y
         * @return {creature}
         */
        skeleton: function (x, y, level) {
            return this._generic('Skeleton', 15, 4, 2, 2, 4, 10, 'undead0', 24, 20, x, y, level);
        },

        /**
         * Create a fairy at (x, y)
         * @param  {number} x
         * @param  {number} y
         * @return {creature}
         */
        fairy: function (x, y, level) {
            return this._generic('Fairy', 20, 2, 0, 3, 5, 10, 'humanoid0', 34, 3, x, y, level);
        },

        /**
         * Create the player
         * @return {player}
         */
        player: function () {
            return this._makePlayer(creator.player.name, creator.player.hp, creator.player.mp, creator.player.str,
                creator.player.def, creator.player.crit, creator.player.vision, creator.player.class);
        }
    };
});
