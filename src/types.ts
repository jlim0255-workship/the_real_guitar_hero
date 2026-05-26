export { Constants, Viewport }
export type {circleBody, tailBody, State, Note, Key, Event, Action}

/**
 * Constants for the game
 */
const Viewport = {
    CANVAS_WIDTH: 200,      // the width of the canvas
    CANVAS_HEIGHT: 400,     // the height of the canvas
} as const;

const Constants = {
    TICK_RATE_MS: 10,       // the rate of time steps
    GREEN_CX: "20%",        // the x coordinate of the green circle
    RED_CX: "40%",          // the x coordinate of the red circle
    BLUE_CX: "60%",         // the x coordinate of the blue circle
    YELLOW_CX: "80%",       // the x coordinate of the yellow circle
    CIRCLE_CY: 350,         // the y coordinate of the circles
    STEPSIZE: 2,            // the step size of the circles
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,       // the radius of the circles
    RANDOM_NOTE_VELOCITY: 100,            // the velocity of the random note
    PIXELS_PER_SECOND: 100,               // tail height scale: 100px per second of note duration           
    SONG_NAME: "RockinRobin",   // the song name

} as const;


/**
 * State of the game
 * This declaration of type is inspired by the state.ts in FRP Asteroids example
 * 
 */
type State = Readonly<{
    gameEnd: boolean;
    activeCircles: ReadonlyArray<circleBody>;   // all circles currently falling (user-played and background)
    expiredCircles: ReadonlyArray<circleBody>;  // this tick's expired circles (missed or hit), cleared next tick
    activeTails: ReadonlyArray<tailBody>;       // tail rectangles currently falling
    expiredTails: ReadonlyArray<tailBody>;      // this tick's expired tails, cleared next tick
    note: Note | undefined                      // the most recent note, used for background sound
    score: number,                              // the score of the game
    highScore: number,                          // the high score of the game
    time: number,                               // the time of the game in seconds
    circleCount: number,                        // the count of circles, used to assign unique ids
    actions: ReadonlyArray<string>,             // pending one-tick actions e.g. "playRandomNote"
    paused: boolean,                            // whether the game is paused
    multiplier: number,                         // score multiplier, increases with consecutive hits
    comboCount: number,                         // consecutive hits without a miss
    missedCount: number,                        // total missed notes
}>;



/**
 * Note object
 */
type Note = Readonly<{
    user_played: boolean    // the note is user played or not
    instrument_name : string,   // the instrument name of the note
    velocity: number,       // the volume of the note
    pitch: number,          // the pitch of the note
    start: number,          // the start time of the note
    end: number             // the end time of the note
}>

/**
 * Circle object, every circle that participates in physics is a circle object
 * This declaration of type is inspired by the state.ts in FRP Asteroids example
 * Mostly from the Body type
 */
type circleBody = Readonly<{
    id: string           // the id of the circle
    r: string,          // the radius of the circle
    cx: string,         // the x coordinate of the circle
    cy: string,         // the y coordinate of the circle
    style: string,      // the style of the circle
    class: string,      // the class of the circle
    note: Note | undefined, // the note of the circle
    clicked: boolean    // the circle is clicked or not
}>

/**
 * tailBody represents a long note tail rectangle.
 * Linked to its parent circleBody by sharing the same id.
 * cy is the top edge of the SVG rect, increases each tick as tail falls.
 * height is fixed at creation, calculated from note duration * pixels per second.
 * held tracks whether the user is currently holding the correct key over this tail.
 */
type tailBody = Readonly<{
    id: string;         // same id as parent circleBody
    cx: string;         // same column as parent circle
    cy: string;         // top edge of rect, increases each tick
    width: string;      // diameter of the parent circle
    height: string;     // fixed height proportional to note duration
    style: string;      // same color as parent circle
    class: string;
    note: Note;
    held: boolean;      // true while user holds correct key over this tail
}>


/**
 * Key codes, string literals for the keys used in game controls
 */
type Key = "KeyH" | "KeyJ" | "KeyK" | "KeyL" | "KeyP" | "KeyR";

/**
 * Event types, we have three types of events: keydown, keyup, keypress
 */
type Event = "keydown" | "keyup" | "keypress";

/**
 * Action interface
 * This declaration of Action interface is inspired by the state.ts in FRP Asteroids example
 * Classes that implement this interface will be used to apply actions to the state, thus updating the state
 */
interface Action {
    apply(s: State): State;
}