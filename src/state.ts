export { initialState, reduceState, Tick, CircleData as CircleInfo, TailData, LongNoteData, GameKeyPress, PauseKeyPress, KeyRelease, EndGameAction};
import { Action, State, Constants, circleBody, tailBody, Note, Viewport} from './types';
import {not} from './util';

/**
 * state transducer
 * This function is inspired by FRP Asteroids example of reduceState in state.ts
* @param s input State
* @param action type of action to apply to the State
* @returns a new State 
*/
const reduceState = (s: State, action: Action) => {
    return action.apply(s);
}

/**
 * Initialize the initial state of the game
 */
const initialState: State = {
    gameEnd: false,
    activeCircles: [],
    expiredCircles: [],
    activeTails: [],
    expiredTails: [],
    note: undefined,
    score: 0,
    highScore: 0,
    time: 0,
    circleCount: 0,
    actions: [],
    paused: false,
    multiplier: 1,
    comboCount: 0,
    missedCount: 0,
} as const;


////////////////////////////////////STATE UPDATE //////////////////////////////////////////

/**
 * This class will handle the state update when the time interval tick
 * Including the circle movement, collision, and circle expiration(out of the border)
 * Also, update the score, missed count, high score, and combo count
 * 
 * This Action class Tick is inspired by FRP Asteroids example in state.ts
 * Mostly the circle movement and expiration part
 * But I have implmented a new feature to handle the circle expiration (out of the border)
 * Then update the state accordingly with the new score, missed count, high score, and combo count
 */
class Tick implements Action {

    /**
     * @param time the current interval tick count
     */
    constructor(public readonly time: number) { }

    /**
     * Each tick: move all falling circles and tails down by STEPSIZE,
     * expire anything that has passed the canvas border,
     * and update missed count and combo accordingly.
     * expiredCircles and expiredTails only hold THIS tick's newly expired objects
     * so the view can remove them from the DOM, then they are cleared next tick.
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {

        // a circle or tail has expired when it passes the bottom of the canvas
        const pastBorder = (obj: { cy: string }) =>
            Number(obj.cy) > Viewport.CANVAS_HEIGHT

        // bottom edge of a tail = cy + height
        // tail reaches the hit zone when its bottom edge >= CIRCLE_CY
        const tailBottomEdge = (tail: tailBody) =>
            Number(tail.cy) + Number(tail.height)

        // partition circles into expired (missed) and still active
        const expiredCircles = s.activeCircles.filter(pastBorder)
        const activeCircles = s.activeCircles
            .filter(not(pastBorder))
            .map(this.moveCircle)

        // [FIX] tail logic now has three cases:
        // 1. tail past canvas border AND held: true  -> fully held, award score
        // 2. tail bottom reached hit zone AND held: false -> released early, remove
        // 3. otherwise -> keep falling
        const fullyHeldTails = s.activeTails.filter(
            tail => pastBorder(tail) && tail.held
        )
        const releasedEarlyTails = s.activeTails.filter(
            tail => tailBottomEdge(tail) >= Constants.CIRCLE_CY && !tail.held
        )
        const expiredTails = fullyHeldTails.concat(releasedEarlyTails)
        const activeTails = s.activeTails
            .filter(tail => !pastBorder(tail))
            .filter(tail => !(tailBottomEdge(tail) >= Constants.CIRCLE_CY && !tail.held))
            .map(this.moveTail)

        // award score for each fully held tail
        const tailScore = fullyHeldTails.reduce(
            (acc, tail) => acc + s.multiplier, 0
        )

        // clear one-tick actions from the previous tick
        const actions = s.actions.filter(action => action !== "playRandomNote")

        // each expired circle that was not clicked counts as a missed note
        const missedCount = s.missedCount + expiredCircles.filter(
            c => c.note?.user_played === true
        ).length

        // combo resets when a user-played note is missed
        const comboCount = missedCount > s.missedCount ? 0 : s.comboCount

        // score grows on tail completion, high score tracks the maximum
        const score = s.score + tailScore
        const highScore = Math.max(score, s.highScore)

        if (s.paused) return { ...s }

        return {
            ...s,
            activeCircles,
            expiredCircles,   // only this tick's expired circles, cleared next tick
            activeTails,
            expiredTails,     // only this tick's expired tails, cleared next tick
            time: this.time,
            actions,
            missedCount,
            comboCount,
            score,
            highScore,
        }
    }

    /**
     * Returns a new circleBody moved down by STEPSIZE.
     * Pure function: does not modify the original circle.
     */
    moveCircle = (circle: circleBody): circleBody => ({
        ...circle,
        cy: String(Number(circle.cy) + Constants.STEPSIZE)
    })

    /**
     * Returns a new tailBody moved down by STEPSIZE.
     * Pure function: does not modify the original tail.
     */
    moveTail = (tail: tailBody): tailBody => ({
        ...tail,
        cy: String(Number(tail.cy) + Constants.STEPSIZE)
    })
}

/**
 * CircleData creates a falling circle for a given note and adds it to activeCircles.
 * Only user_played notes get a visible circle - background notes are stored in
 * state.note for sound playback only.
 *
 * This Action class is inspired by FRP Asteroids example in state.ts.
 */
class CircleData implements Action {

    constructor(public readonly note: Note) {}

    /**
     * Maps a pitch value to a column index (0-3) and its matching color.
     * Uses pitch modulo 4 to distribute notes evenly across all four columns.
     */
    assign_column(pitch: number): { column: number; color: string } {
        const column = pitch % 4;
        const color = ["green", "red", "blue", "yellow"][column];
        return { column, color };
    }

    /**
     * Builds a circleBody from a note.
     * id is assigned later in apply() once we know the current circleCount.
     */
    createCircleData(note: Note): circleBody {
        const { column, color } = this.assign_column(note.pitch);
        return {
            r: `${Constants.RADIUS}`,
            cx: `${20 + column * 20}%`,
            cy: "0",
            style: `fill: ${color}`,
            class: "shadow",
            id: "",
            note,
            clicked: false
        };
    }

    /**
     * [FIX] Removed userPlayCircles - all user-played circles now live only in
     * activeCircles. Non-user-played notes are stored in state.note for
     * background sound playback without creating a visible circle.
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {

        if (s.paused) return { ...s }

        // [FIX] user_played notes get a visible circle in activeCircles
        // non-user-played notes are stored in state.note only (for sound)
        if (this.note.user_played) {
            const circle = {
                ...this.createCircleData(this.note),
                id: String(s.circleCount)
            };
            return {
                ...s,
                note: this.note,
                activeCircles: s.activeCircles.concat(circle),
                circleCount: s.circleCount + 1
            }
        }

        // background note: no circle created, just store note for sound
        return {
            ...s,
            note: this.note,
            circleCount: s.circleCount + 1
        }
    }
}

/**
 * [FIX] PressedKey split into two separate action classes:
 * - GameKeyPress: handles H/J/K/L (hit detection, scoring)
 * - PauseKeyPress: handles P/R (pause and resume)
 * Previously both were in one class, causing game keys to overwrite paused state.
 */

/**
 * GameKeyPress handles H/J/K/L key presses.
 * Checks if a circle is within the hit zone for the pressed column.
 * On hit: moves circle to expiredCircles (clicked=true), increments score and combo.
 * On miss: plays a random note, increments missedCount, resets combo and multiplier.
 */
class GameKeyPress implements Action {
    constructor(public readonly e: KeyboardEvent) {}

    apply(s: State): State {

        // do nothing if paused
        if (s.paused) return { ...s }

        // find all circles in the hit zone for the pressed column
        const collidedCircles = s.activeCircles.filter(this.circleBodyCollision)
        const isHit = collidedCircles.length > 0

        // mark collided circles as clicked so view.ts can trigger sound
        const clickedCircles = collidedCircles.map(circle => ({ ...circle, clicked: true }))

        // remaining circles continue falling
        const activeCircles = s.activeCircles.filter(not(this.circleBodyCollision))

        // [FIX] expiredCircles only holds this tick's newly expired circles
        const expiredCircles = clickedCircles

        // on miss: trigger a random note
        const actions = isHit ? s.actions : s.actions.concat("playRandomNote")

        // score grows on hit, never resets
        // [FIX] removed score reset on miss
        const scoreIncrement = isHit ? collidedCircles.length * s.multiplier : 0
        const score = s.score + scoreIncrement
        const highScore = Math.max(s.highScore, score)

        // combo increments on hit, resets on miss
        const comboCount = isHit ? s.comboCount + 1 : 0

        // [FIX] multiplier: +0.2 every 10 consecutive hits, resets to 1 on miss
        // spec says: 10 notes = 1.2x, 20 notes = 1.4x
        const multiplier = isHit
            ? initialState.multiplier + 0.2 * Math.floor(comboCount / 10)
            : initialState.multiplier

        // missed count increments when pressing with no circle in range
        const missedCount = isHit ? s.missedCount : s.missedCount + 1

        // if a circle was hit, find its matching tail by id and set held: true
        // the tail id matches the circle id (set in LongNoteData)
        const hitIds = new Set(collidedCircles.map(c => c.id))
        const activeTails = s.activeTails.map(tail =>
            hitIds.has(tail.id) ? { ...tail, held: true } : tail
        )

        return {
            ...s,
            score,
            highScore,
            activeCircles,
            expiredCircles,
            activeTails,
            actions,
            comboCount,
            multiplier,
            missedCount,
        }
    }

    /**
     * Returns the expected cx and hit-zone cy for the pressed key.
     * Used to match against falling circle positions.
     */
    getStaticXandY(): [string, number] {
        const staticY = Constants.CIRCLE_CY;
        switch (this.e.code) {
            case "KeyH": return [Constants.GREEN_CX, staticY];
            case "KeyJ": return [Constants.RED_CX, staticY];
            case "KeyK": return [Constants.BLUE_CX, staticY];
            case "KeyL": return [Constants.YELLOW_CX, staticY];
            default:     return ["0", 0];
        }
    }

    /**
     * Returns true if the circle is in the correct column and within
     * the tolerance margin of the hit zone.
     * Inspired by FRP Asteroids bodyCollision.
     */
    circleBodyCollision = (circle: circleBody): boolean => {
        const [staticX, staticY] = this.getStaticXandY();
        const toleranceMargin = Constants.RADIUS * 1.25;
        if (staticX !== circle.cx) return false;
        return Math.abs(staticY - Number(circle.cy)) <= toleranceMargin;
    }
}

/**
 * [FIX] PauseKeyPress handles P and R keys only.
 * Separated from GameKeyPress so game key presses cannot accidentally
 * overwrite the paused state.
 * P -> paused: true
 * R -> paused: false
 */
class PauseKeyPress implements Action {
    constructor(public readonly e: KeyboardEvent) {}

    apply(s: State): State {
        switch (this.e.code) {
            case "KeyP": return { ...s, paused: true }
            case "KeyR": return { ...s, paused: false }
            default:     return { ...s }
        }
    }
}

/**
 * TailData creates a falling tail rectangle for a long note (duration > 1 second).
 * The tail is linked to its parent circle by sharing the same id.
 * Height is calculated from note duration * PIXELS_PER_SECOND.
 * The tail starts above the top of the canvas so it arrives at the hit zone
 * at the same time as its parent circle.
 */
class TailData implements Action {

    constructor(public readonly note: Note) {}

    /**
     * Builds a tailBody from a note.
     * cx and style match the parent circle so they appear in the same column.
     * cy starts negative so the tail enters from the top with its circle.
     * @param note the long note to build a tail for
     * @param id the circleCount at creation time, shared with parent circle
     */
    createTailData(note: Note, id: string): tailBody {
        const column = note.pitch % 4;
        const color = ["green", "red", "blue", "yellow"][column];
        const cx = `${20 + column * 20}%`;

        // height is duration in seconds * PIXELS_PER_SECOND scale factor
        const duration = note.end - note.start;
        const height = duration * Constants.PIXELS_PER_SECOND;

        // width matches the circle diameter
        const width = String(Constants.RADIUS * 2);

        // cy starts so the bottom of the tail aligns with cy=0 (top of canvas)
        // as the tail falls, its bottom edge reaches the hit zone with its circle
        const cy = String(-height);

        return {
            id,
            cx,
            cy,
            width,
            height: String(height),
            style: `fill: ${color}; opacity: 0.5`,
            class: "shadow",
            note,
            held: false
        };
    }

    /**
     * Adds a new tailBody to activeTails.
     * Uses the same circleCount id as the circle created by CircleData
     * so they can be matched by id in the view.
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {

        if (s.paused) return { ...s }

        const tail = this.createTailData(this.note, String(s.circleCount));

        return {
            ...s,
            activeTails: s.activeTails.concat(tail),
        }
    }
}

/**
 * LongNoteData merges CircleData and TailData into a single action.
 * Both circle and tail are created with the same id (circleCount at time of creation)
 * so GameKeyPress can match them by id when the user hits the circle.
 *
 * This is function composition: apply CircleData first to get the circle and
 * the incremented circleCount, then attach the tail using the id from before
 * the increment. This avoids the id mismatch that would occur if they fired
 * as separate stream events.
 */
class LongNoteData implements Action {

    constructor(public readonly note: Note) {}

    /**
     * Applies CircleData then TailData in sequence.
     * The shared id is captured before CircleData increments circleCount.
     * @param s old State
     * @returns new State with both circle and tail added
     */
    apply(s: State): State {

        if (s.paused) return { ...s }

        // capture id before CircleData increments circleCount
        const sharedId = String(s.circleCount)

        // apply CircleData to create the visible circle
        const stateWithCircle = new CircleData(this.note).apply(s)

        // build tail using the same id, reusing TailData's pure creation function
        const tail = new TailData(this.note).createTailData(this.note, sharedId)

        return {
            ...stateWithCircle,
            activeTails: stateWithCircle.activeTails.concat(tail)
        }
    }
}

/**
 * KeyRelease fires on keyup for H/J/K/L.
 * Finds the matching tail in activeTails by column and sets held: false.
 * This signals Tick to remove the tail without awarding score.
 */
class KeyRelease implements Action {

    constructor(public readonly e: KeyboardEvent) {}

    /**
     * Returns the cx column string for the released key.
     * Used to find the matching tail in activeTails.
     */
    getColumn(): string {
        switch (this.e.code) {
            case "KeyH": return Constants.GREEN_CX;
            case "KeyJ": return Constants.RED_CX;
            case "KeyK": return Constants.BLUE_CX;
            case "KeyL": return Constants.YELLOW_CX;
            default:     return "";
        }
    }

    /**
     * Sets held: false on any active tail in the released column.
     * A tail with held: false will be removed by Tick without score.
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {

        if (s.paused) return { ...s }

        const column = this.getColumn()

        // set held: false on tails in the released column
        const activeTails = s.activeTails.map(tail =>
            tail.cx === column ? { ...tail, held: false } : tail
        )

        return { ...s, activeTails }
    }
}

/**
 * This class will handle the state update when the game is ended
 */
class EndGameAction implements Action {
    /** 
     * end the game
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {

        return {
            ...s,
            gameEnd: true,
        };
    }
}