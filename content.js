const SCALE = 3;
const CELL_LENGTH = 22;
const MOVE_DIRECTIONS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const PADDING = 10;
const canvas = document.createElement("canvas");
canvas.style = "z-index: 1;position: fixed;left: 0;top: 0;pointer-events: none";

const context = canvas.getContext("2d");
let maxRows = 10;
let maxCols = 10;

/**
 * @typedef AnimationData
 * @type {object}
 * @property {string} name
 * @property {number} frameWidth
 * @property {number} frameHeight
 * @property {number[]} durations
 * @property {ImageBitmap[][]} animSprites
 */

/**
 * @typedef Vector2D
 * @type {object}
 * @property {number} x
 * @property {number} y
 */

/** Animated sprite. */
class AnimatedSprite {
    /**
     * Constructor for an animated sprite
     * @param {AnimationData[]} animations
     */
    constructor(animations) {
        this.animations = animations;
        this.currentAnimation = animations[0];

        this.frameIndex = 0;
        this.rowIndex = 0;
        this.remainingFrameDuration = 0;

        this.paused = true;
    }

    /**
     * Updates row index in current sprite sheet
     * @param {number} rowIndex
     */
    setRow(rowIndex) {
        if (rowIndex >= this.rowCount()) {
            throw new Error(`Row ${rowIndex} is out of range for animation ${this.animationIndex}.`);
        }
        this.rowIndex = rowIndex;
    }

    /**
     * Updates current animation being played 
     * @param {string} animationId
     */
    play(animationId) {
        const index = this.animations.findIndex(animation => animation.name === animationId);
        if (index === -1) {
            throw new Error(`Failed to find animation with name ${animationId}`);
        }
        this.currentAnimation = this.animations[index];
        if (this.rowIndex >= this.rowCount()) {
            this.setRow(0);
        }
        this.resetPlayback();
        this.paused = false;
    }

    stop() {
        this.paused = true;
    }

    resetPlayback() {
        this.frameIndex = 0;
        this.remainingFrameDuration = this.currentAnimation.durations[0];
    }

    update() {
        if (this.paused) {
            return;
        }
        this.remainingFrameDuration--;
        if (this.isEndReached()) {
            return;
        }
        if (this.remainingFrameDuration <= 0) {
            this.frameIndex++;
            this.remainingFrameDuration = this.currentAnimation.durations[this.frameIndex];
            return;
        }
    }

    /**
     * Returns true if the playback reached the end.
     * @returns {boolean}
     */
    isEndReached() {
        return this.remainingFrameDuration <= 0 && this.frameIndex === this.currentAnimation.durations.length - 1;
    }

    /**
     * Renders sprite at given x, y position
     * @param {number} x
     * @param {number} y
     */
    render(x, y) {
        const sprite = this.currentAnimation.animSprites[this.rowIndex][this.frameIndex];
        const width = this.currentAnimation.frameWidth;
        const height = this.currentAnimation.frameHeight;
        context.drawImage(sprite, x - width / 2, y - height / 2, width, height);
    }

    rowCount() {
        return this.currentAnimation.animSprites.length;
    }
}

/** Pokemon AI */
class Pokemon {
    /**
     * Constructor for Pokemon entity.
     * @param {number} row
     * @param {number} col
     * @param {AnimatedSprite} animatedSprite
     */
    constructor(row, col, animatedSprite) {
        this.updateGridPosition(row, col);
        this.sprite = animatedSprite;
        this.nextState();
    }

    update() {
        this.actionTimer++;
        this.sprite.update();
        if (this.actionTimer >= this.actionDuration && this.moveRepeats > 0) {
            this.move();
            this.moveRepeats--;
        }
        if (this.actionTimer >= this.actionDuration) {
            this.nextState();
        }
    }

    render() {
        if (this.prevPosition) {
            const t = this.actionTimer / this.actionDuration;
            this.sprite.render(
                this.prevPosition.x * (1 - t) + this.position.x * t,
                this.prevPosition.y * (1 - t) + this.position.y * t
            );
        } else {
            this.sprite.render(this.position.x, this.position.y);
        }
    }

    nextState() {
        this.prevPosition = undefined;

        if (Math.random() < 0.5) {
            this.moveRepeats = 1 + Math.floor(Math.random() * 2); // 1 to 3 repeats
            this.directionIndex = Math.floor(Math.random() * MOVE_DIRECTIONS.length);
            this.move();
        } else {
            this.sprite.play("Idle");
            this.actionTimer = 0;
            this.actionDuration = this.sprite.currentAnimation.durations.reduce((duration, acc) => acc + duration, 0);
        }
    }

    move() {
        if (this.row <= 0) {
            this.directionIndex = 0;
        } else if (this.col <= 0) {
            this.directionIndex = 2;
        } else if (this.row >= maxRows - 1) {
            this.directionIndex = 4;
        } else if (this.col >= maxCols - 1) {
            this.directionIndex = 6;
        }

        this.sprite.play("Walk");
        this.sprite.setRow(this.directionIndex);
        this.actionTimer = 0;
        this.actionDuration = this.sprite.currentAnimation.durations.reduce((duration, acc) => acc + duration, 0);

        this.prevPosition = this.position;
        const [deltaRow, deltaCol] = MOVE_DIRECTIONS[this.directionIndex];
        this.updateGridPosition(this.row + deltaRow, this.col + deltaCol);
    }

    /**
     * Updates current position of Pokemon.
     * @param {number} row
     * @param {number} col
     */
    updateGridPosition(row, col) {
        this.row = row;
        this.col = col;
        this.position = toCoordinate(row, col);
    }
}

/**
 * Loads animation data and sprites for the given pokemon.
 * @param {string} pokemonName
 * @returns {Promise<AnimationData[]>}
 */
async function loadAnimation(pokemonName) {
    const animDataUrl = chrome.runtime.getURL(`pokesprites/${pokemonName}/AnimData.xml`);
    console.log("BRuh");
    console.log(animDataUrl);
    const response = await fetch(animDataUrl);
    const parser = new DOMParser();
    const xml = parser.parseFromString(await response.text(), "text/xml");
    const anims = xml.querySelectorAll("Anims > Anim");

    /** @type {AnimationData[]} */
    const animations = [];

    /** @type {Promise<ImageBitmap[][]>[]} */
    const spritePromises = [];

    for (let anim of anims) {
        /** @type {AnimationData} */
        const animation = {};

        for (let attribute of anim.childNodes) {
            switch (attribute.tagName) {
                case "Name":
                    animation.name = attribute.firstChild.nodeValue;
                    break;
                case "FrameWidth":
                    animation.frameWidth = Number(attribute.firstChild.nodeValue);
                    break;
                case "FrameHeight":
                    animation.frameHeight = Number(attribute.firstChild.nodeValue);
                    break;
                case "Durations":
                    animation.durations = [];
                    for (let duration of attribute.childNodes) {
                        if (duration.tagName === "Duration") {
                            animation.durations.push(Number(duration.firstChild.nodeValue));
                        }
                    }
                    break;
                default:
            }
        }

        if (animation.name) {
            const spriteUrl = chrome.runtime.getURL(`pokesprites/${pokemonName}/${animation.name}-Anim.png`);
            const spritePromise = loadSprites(spriteUrl, animation.frameWidth, animation.frameHeight);
            animations.push(animation);
            spritePromises.push(spritePromise);
        }
    }

    const spriteMatrices = await Promise.all(spritePromises);
    for (let i = 0; i < animations.length; i++) {
        animations[i].animSprites = spriteMatrices[i];
    }

    return animations;
}

/**
 * Loads spritesheet at the given path.
 * @param {string} path 
 * @returns {number} frameWidth
 * @returns {number} frameHeight
 * @returns {Promise<ImageBitmap[][]>}
 */
async function loadSprites(path, frameWidth, frameHeight) {
    const image = new Image();
    return new Promise((resolve, reject) => {
        image.onload = () => {
            const framePromises = [];
            const rows = Math.floor(image.height / frameHeight);
            const cols = Math.floor(image.width / frameWidth);
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    const bitmap = createImageBitmap(image, frameWidth * j, frameHeight * i, frameWidth, frameHeight);
                    framePromises.push(bitmap);
                }
            }
            resolve(Promise.all(framePromises).then(frames => {
                const frameMatrix = [];
                for (let i = 0; i < rows; i++) {
                    const row = [];
                    for (let j = 0; j < cols; j++) {
                        row.push(frames[i * cols + j]);
                    }
                    frameMatrix.push(row);
                }
                return frameMatrix;
            }));
        };
        image.onerror = () => {
            reject(`Could not load image`);
        };
        image.src = path;
    });
}

function resize() {
    canvas.width = window.innerWidth - PADDING;
    canvas.height = window.innerHeight - PADDING;
    maxRows = Math.floor(canvas.height / (CELL_LENGTH * SCALE));
    maxCols = Math.floor(canvas.width / (CELL_LENGTH * SCALE));
}

/**
 * Returns a Vector2D coordinate for a given grid index
 * @param {number} row 
 * @param {number} col 
 * @returns {Vector2D}
 */
function toCoordinate(row, col) {
    return {
        x: (col + 0.5) * CELL_LENGTH,
        y: (row + 0.5) * CELL_LENGTH
    };
}

window.addEventListener("resize", () => {
    resize();
});

async function main() {
    const pokemonNames = ["Gengar", "Misdreavus", "Litwick"];
    const animDataList = await Promise.all(pokemonNames.map(name => loadAnimation(name)));

    /** @type {Pokemon[]} */
    const entities = [];
    for (let i = 0; i < 4; i++) {
        const row = Math.floor(Math.random() * maxRows);
        const col = Math.floor(Math.random() * maxCols);
        const animData = animDataList[Math.floor(Math.random() * animDataList.length)];
        entities.push(new Pokemon(row, col, new AnimatedSprite(animData)));
    }

    function update() {
        // Update
        for (let entity of entities) {
            entity.update();
        }

        // Render
        context.save();
        context.imageSmoothingEnabled = false;
        context.scale(SCALE, SCALE);
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (let entity of entities) {
            entity.render();
        }
        context.restore();

        requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(canvas);
    resize();
    main();
});

