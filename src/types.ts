export { Constants, Viewport }
export type {circleBody, State, Note, Key, Event, Action}
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
    SONG_NAME: "RockinRobin",   // the song name

} as const;


/**
 * State of the game
 * This declaration of type is inspired by the state.ts in FRP Asteroids example
 * 
 */
type State = Readonly<{
    gameEnd: boolean;
    activeCircles: ReadonlyArray<circleBody>;   // circles appering on the screen right now
    expiredCircles: ReadonlyArray<circleBody>;  // circles that have been clicked or missed
    userPlayCircles: ReadonlyArray<circleBody>; // circles for user to play
    note: Note | undefined                      // the note to play
    score: number,                              // the score of the game
    highScore: number,                          // the high score of the game
    time: number,                               // the time of the game in seconds
    circleCount: number,                        // the count of circles
    actions: ReadonlyArray<string>,             // the actions of the game, (playRandomNote)
    paused: boolean,                            // the game is paused or not
    multiplier: number,                         // the multiplier of the game
    comboCount: number,                         // the combo count of the game
    missedCount: number,                        // the missed count of the game
    tails: TailNote[];                      // active tails
    holds: Record<LaneKey, boolean>;        // is key currently down per lane
    playing: Record<LaneKey, Note | null>;  // audio currently playing per lane
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


// How long is "long"
export const LONG_NOTE_THRESHOLD_MS = 1000;

// Lane keys we use
export type LaneKey = 'KeyH' | 'KeyJ' | 'KeyK' | 'KeyL';

// Tail state for a long note
export type TailStatus = 'idle' | 'holding' | 'fail' | 'done';

export interface TailNote {
  id: string;             // same id as the head circle
  laneKey: LaneKey;       // which lane
  totalMs: number;        // full duration
  remainingMs: number;    // countdown to 0
  status: TailStatus;     // holding / fail / done
  note: Note;             // original note
}

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