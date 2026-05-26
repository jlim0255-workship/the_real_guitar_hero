// export { initialState, reduceState, Tick, CircleData as CircleInfo, PressedKey, EndGameAction};

export {
    initialState,
    reduceState,
    Tick,
    CircleData as CircleInfo,
    PressedKey,
    ReleasedKey,
    EndGameAction,
};

// import { Action, State, Constants, circleBody, Note, Viewport, Key} from './types';
import {
    Action,
    State,
    Constants,
    circleBody,
    Note,
    Viewport,
    Key,
    // 👇 new imports for long-note scaffolding
    TailNote,
    LaneKey,
    LONG_NOTE_THRESHOLD_MS,
} from "./types";
import { not } from "./util";

/**
 * state transducer
 * This function is inspired by FRP Asteroids example of reduceState in state.ts
 * @param s input State
 * @param action type of action to apply to the State
 * @returns a new State
 */
const reduceState = (s: State, action: Action) => {
    return action.apply(s);
};

/* add helpers somewhere near the key types */
const isPauseKey = (code: Key) => code === "KeyP" || code === "KeyR";

/** lane helpers for long notes (used in later steps) */
const isLaneKey = (code: string): code is LaneKey =>
    code === "KeyH" || code === "KeyJ" || code === "KeyK" || code === "KeyL";

const cxToLaneKey = (cx: string): LaneKey => {
    switch (cx) {
        case Constants.GREEN_CX:
            return "KeyH";
        case Constants.RED_CX:
            return "KeyJ";
        case Constants.BLUE_CX:
            return "KeyK";
        case Constants.YELLOW_CX:
            return "KeyL";
        default:
            return "KeyH";
    }
};

/**
 * Initialize the initial state of the game
 */
const initialState: State = {
    gameEnd: false,
    activeCircles: [],
    expiredCircles: [],
    userPlayCircles: [],
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

    tails: [] as TailNote[], // active tails
    holds: { KeyH: false, KeyJ: false, KeyK: false, KeyL: false }, // is key held?
    playing: { KeyH: null, KeyJ: null, KeyK: null, KeyL: null }, // sustained note per lane
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
     * The constructor for the Tick class
     * It will take the time interval tick as the parameter
     * This time interval tick will be used to update the state
     *
     * @param time the time interval tick
     */
    constructor(public readonly time: number) {}
    /**
     * interval tick: circlebodies move, collisions happen, circles expire (out of the border)
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {
        // check if the circle has expired (out of the border)
        const expired = (circle: circleBody) =>
            Number(circle.cy) > Viewport.CANVAS_HEIGHT;

        // filter out the expired circles
        const expiredCircles = s.activeCircles.filter(expired);
        const activeCircles = s.activeCircles.filter(not(expired));

        // update the position of the active circles
        const updatedActiveCircles = activeCircles.map((circle) =>
            this.moveCircle(circle),
        );

        //map the clicked of circle to false
        const updatedUserPlayCircles = s.userPlayCircles.filter(
            (circle) => !circle.clicked,
        );

        //remove the actions playRandomNote in actions
        const actions = s.actions.filter(
            (action) => action !== "playRandomNote",
        );

        // increment the missed count when the circle has expired (passing the border)
        const updatedMissedCount = s.missedCount + expiredCircles.length;

        // reset the score if there is circle expired (passing the border)
        const updatedSocre = s.missedCount !== updatedMissedCount ? 0 : s.score;

        // update the high score, if the updated score is greater than the high score
        // else keep the high score
        const updatedHighScore = Math.max(updatedSocre, s.highScore);

        // if the game is not paused, then update the state
        // if (s.paused === false) {

        //     // return a new state with the updated active circles, expired circles, and missed count
        //     return {
        //         ...s,
        //         expiredCircles: expiredCircles.concat(s.expiredCircles),
        //         activeCircles: updatedActiveCircles,
        //         userPlayCircles: updatedUserPlayCircles,
        //         note: s.note,
        //         time: this.time,
        //         actions: actions,
        //         missedCount: updatedMissedCount,  // increment the missed count when the circle has expired
        //         score: updatedSocre,  // Reset score if no hit
        //         highScore: updatedHighScore,
        //         comboCount: s.missedCount !== updatedMissedCount ? 0 : s.comboCount,  // Reset combo count if no hit
        //     }
        // }

        // if the game is paused, then return the old state
        // else {
        //     return {...s,};
        // }

        if (s.paused === false) {
            // Base next state from your existing circle logic
            let next: State = {
                ...s,
                expiredCircles: expiredCircles.concat(s.expiredCircles),
                activeCircles: updatedActiveCircles,
                userPlayCircles: updatedUserPlayCircles,
                note: s.note,
                time: this.time,
                actions: actions,
                missedCount: updatedMissedCount,
                score: updatedSocre,
                highScore: updatedHighScore,
                comboCount:
                    s.missedCount !== updatedMissedCount ? 0 : s.comboCount,
            };

            // ===== Long-note tail advancement & settlement =====
            const dt =
                typeof (Constants as any).TICK_RATE_MS === "number"
                    ? (Constants as any).TICK_RATE_MS
                    : 10;

            let scoreDelta = 0;
            let extraMisses = 0;
            const tailActions: string[] = [];

            const advancedTails = next.tails.map((t) => {
                // Already terminal? keep as-is (we'll filter later)
                if (t.status === "done" || t.status === "fail") return t;

                const held = next.holds[t.laneKey];

                // If released after starting (remaining < total) -> fail immediately
                if (!held && t.remainingMs < t.totalMs) {
                    return { ...t, status: "fail" as TailNote["status"] };
                }

                // If holding, count down
                if (held) {
                    const rem = Math.max(0, t.remainingMs - dt);
                    if (rem === 0) {
                        // Completed!
                        return {
                            ...t,
                            remainingMs: 0,
                            status: "done" as TailNote["status"],
                        };
                    }
                    return {
                        ...t,
                        remainingMs: rem,
                        status: "holding" as TailNote["status"],
                    };
                }

                // Not held and not started yet (remaining == total): still idle, wait for hold to begin
                return { ...t, status: "idle" as TailNote["status"] };
            });

            // Settle scoring/misses and issue stop actions for tails that just reached a terminal state
            const finalized = advancedTails.map((t) => {
                if (t.status === "done") {
                    // Award once when we mark done
                    const gain = 1 * next.multiplier; // tweak base value if you want duration-based scoring
                    scoreDelta += gain;
                    tailActions.push(`stopHold:${t.laneKey}`);
                } else if (t.status === "fail") {
                    extraMisses += 1;
                    tailActions.push(`stopHold:${t.laneKey}`);
                }
                return t;
            });

            // Remove terminal tails from active list
            const liveTails = finalized.filter(
                (t) => t.status !== "done" && t.status !== "fail",
            );

            // Update score/combos from tails
            const newMissed = next.missedCount + extraMisses;
            const newScore = extraMisses > 0 ? 0 : next.score + scoreDelta;
            const newHigh = Math.max(newScore, next.highScore);
            const newCombo =
                extraMisses > 0 || scoreDelta === 0 ? 0 : next.comboCount + 1;
            const newMult = Math.min(
                initialState.multiplier + 0.25 * Math.floor(newCombo / 10),
                4,
            );

            next = {
                ...next,
                tails: liveTails,
                actions: next.actions.concat(tailActions),
                missedCount: newMissed,
                score: newScore,
                highScore: newHigh,
                comboCount: newCombo,
                multiplier: newMult,
            };

            return next;
        } else {
            return { ...s };
        }
    }

    /**
     * all tick-based physical movement comes through this function
     * we update the position of the circle by moving it down by a step size
     *
     * This function is inspired by FRP Asteroids example in state.ts
     * Mostly the moveBody part, I modified it using step size
     * @param o a Body to move
     * @returns the moved Body
     */
    moveCircle = (circle: circleBody): circleBody => ({
        ...circle,
        cy: String(Number(circle.cy) + Constants.STEPSIZE),
    });
}

/**
 * This class will create the circle for the note based on the note property
 * if the note is user played, then add the circle to the userPlayCircles
 * if the note is not user played, then add the circle to the activeCircles
 * This will store the note in the state
 *
 * This Action class CircleData is inspired by FRP Asteroids example in state.ts
 * Mostly the createCircleData part, we create the circle based on the note property
 * and add them into the activeCircles or userPlayCircles and return a new state
 */
// class CircleData implements Action {
//     /**
//      * Constructor for the CircleData class
//      * @param note the note to create the circle for
//      */
//     constructor(public readonly note: Note) {}

//     // assign_column will assign the column and color based on the pitch
//     // the column will be assigned based on the pitch modulo 4 so that the circle will be distributed evenly
//     assign_column(pitch: number): { column: number; color: string } {
//         const columns = [0, 1, 2, 3];
//         const column = columns[pitch % 4];
//         const color = ["green", "red", "blue", "yellow"][column];
//         return { column, color };
//     }

//     // createCircleData will create the circle for the note
//     createCircleData(note: Note ) : circleBody | undefined {

//         // assign the column and color based on the pitch
//         const { column, color } = this.assign_column(note.pitch);

//         // return the circle data with the properties
//         return {
//             r: `${Constants.RADIUS}`,
//             cx: `${20 + column * 20}%`,
//             cy: "0",
//             style: `fill: ${color}`,
//             class: "shadow",
//             id: "",   // we will assign the id later when we add the circle to the activeCircles using the circleCount
//             note: note,
//             clicked: false
//         };

//     }

//     /**
//      * create a circle for the note and add it to the activeCircles based on the note property
//      * if the note is user played, then add the circle to the userPlayCircles
//      * if the note is not user played, then add the circle to the activeCircles
//      * @param s old State
//      * @returns new State
//      */
//     apply(s: State): State {

//         // create the circle for the note
//         const circle = this.createCircleData(this.note);

//         // if the game is not paused, then update the state
//         if (s.paused === false) {

//             // if the note is user played, then we will add the circle to the userPlayCircles
//             if (this.note.user_played == true && circle !== undefined) {

//                 const userPlayCircle = {...circle, id: String(s.circleCount), note: this.note, clicked: false};

//                 // return a new state with the circle added to the userPlayCircles
//                 return {
//                     ...s,
//                     note: this.note,
//                     activeCircles: s.activeCircles.concat(userPlayCircle),
//                     circleCount: s.circleCount + 1
//                 }
//             }

//             // else if the note is not user played, then we will add the circle to the activeCircles
//             else {

//                 // return a new state with the circle added to the activeCircles
//                 return {
//                     ...s,
//                     note: this.note,
//                     circleCount: s.circleCount + 1
//                 }
//             }
//         }

//         // if the game is paused, then return the old state
//         else {
//             return {...s};
//         }

//     }
// }

class CircleData implements Action {
    /**
     * Constructor for the CircleData class
     * @param note the note to create the circle for
     */
    constructor(public readonly note: Note) {}

    // assign_column will assign the column and color based on the pitch
    // the column will be assigned based on the pitch modulo 4 so that the circle will be distributed evenly
    assign_column(pitch: number): { column: number; color: string } {
        const columns = [0, 1, 2, 3];
        const column = columns[pitch % 4];
        const color = ["green", "red", "blue", "yellow"][column];
        return { column, color };
    }

    // createCircleData will create the circle for the note
    createCircleData(note: Note): circleBody | undefined {
        const { column, color } = this.assign_column(note.pitch);
        return {
            r: `${Constants.RADIUS}`,
            cx: `${20 + column * 20}%`,
            cy: "0",
            style: `fill: ${color}`,
            class: "shadow",
            id: "", // set later using circleCount
            note,
            clicked: false,
        };
    }

    /**
     * create a circle for the note and add it to state.
     * If duration >= LONG_NOTE_THRESHOLD_MS, also create a TailNote with the SAME id as the head.
     */
    apply(s: State): State {
        // if the game is paused, keep state
        if (s.paused) return { ...s };

        const circle = this.createCircleData(this.note);
        if (!circle) {
            // still advance id counter so ids remain stable
            return { ...s, note: this.note, circleCount: s.circleCount + 1 };
        }

        // assign a stable id shared by head & tail
        const id = String(s.circleCount);
        const head = { ...circle, id, note: this.note, clicked: false };

        // long-note check (assuming this.note.duration is in ms)
        const durMs = Math.max(0, Math.floor((this.note.end - this.note.start) * 1000));
        const isLong = durMs >= LONG_NOTE_THRESHOLD_MS;

        // If long, make a TailNote tied to the same lane as the head (derive lane from cx)
        const maybeTail = isLong
            ? ({
                  id,
                  laneKey: cxToLaneKey(head.cx),
                  totalMs: durMs,
                  remainingMs: durMs,
                  status: "idle",
                  note: this.note,
              } as TailNote)
            : undefined;

        // Preserve your original “user_played” branching for adding the head to activeCircles
        // (If your intention was the opposite, we can flip this later—keeping behavior identical for now.)
        // const nextActive =
        //     this.note.user_played === true
        //         ? s.activeCircles.concat(head)
        //         : s.activeCircles;

        const nextActive = this.note.user_played === true
            ? s.activeCircles.concat(head)
            : s.activeCircles;

        const nextTails = maybeTail ? s.tails.concat(maybeTail) : s.tails;

        return {
            ...s,
            note: this.note,
            activeCircles: nextActive,
            tails: nextTails,
            circleCount: s.circleCount + 1,
        };
    }
}

/**
 * This class will handle the state update when the user press the key
 * Including the score increment, combo count, multiplier, missed count, and paused state
 * Also, check if the user hit the circle or not, and update the userPlayCircles
 * A user may press the key when there is no circle, then the missed count will be incremented
 *
 * This Action class PressedKey is inspired by FRP Asteroids example in state.ts
 * But I have modified the apply function to handle the state update when the user press the key
 * It will further check if the circle is in the correct column, and update the state accordingly
 * with the new score, combo count, multiplier, missed count, and paused state
 *
 */
class PressedKey implements Action {
    constructor(public readonly e: KeyboardEvent) {}

    /**
     * This function will check all the pressing action in game
     * correct key when the circle is in the correct column
     * @param s old State
     * @returns new State
     */
    // apply(s: State): State {
    //     // 1) Pause/Resume: early return, no scoring/miss/combo changes
    //     if (isPauseKey(this.e.code as Key)) {
    //         const paused = this.e.code === 'KeyP' ? true : false;
    //         return { ...s, paused };
    //     }

    //     // From here on, we only want to process lane keys (H/J/K/L).
    //     // If the key is not a lane key, do nothing and don't count a miss.
    //     const isLaneKey =
    //         this.e.code === 'KeyH' ||
    //         this.e.code === 'KeyJ' ||
    //         this.e.code === 'KeyK' ||
    //         this.e.code === 'KeyL';

    //     if (!isLaneKey) {
    //         return s;
    //     }

    //     // 2) Normal hit/miss flow for lane keys
    //     const updatedState = this.pressCircle(s);

    //     const isHit = updatedState.userPlayCircles.length > 0;

    //     const comboCount = isHit ? s.comboCount + 1 : 0;

    //     // Increase multiplier by 0.25 every 5 consecutive hits (cap 4)
    //     const multiplier = Math.min(
    //         initialState.multiplier + 0.25 * Math.floor(comboCount / 5),
    //         4
    //     );

    //     // Only lane-key wrong press should count as a miss; we’re already in lane-key branch.
    //     const missedCount = isHit ? s.missedCount : s.missedCount + 1;

    //     // Reset score only on lane-key miss
    //     const updatedScore = isHit ? updatedState.score : 0;

    //     return {
    //         ...updatedState,
    //         score: updatedScore,
    //         multiplier,
    //         comboCount,
    //         missedCount,
    //     };
    //     }

    apply(s: State): State {
        // Pause/Resume early return
        if (isPauseKey(this.e.code as Key)) {
            const paused = this.e.code === "KeyP" ? true : false;
            return { ...s, paused };
        }

        // Only lane keys matter
        const code = this.e.code;
        const isLane =
            code === "KeyH" ||
            code === "KeyJ" ||
            code === "KeyK" ||
            code === "KeyL";
        if (!isLane) return s;
        if (s.paused) return s;

        // Find collided head circles using your existing collision fn
        const collidedCircles = s.activeCircles.filter(
            this.circleBodyCollision,
        );
        const remainingCircles = s.activeCircles.filter(
            not(this.circleBodyCollision),
        );

        // Miss: lane key but no head
        if (collidedCircles.length === 0) {
            const actions = s.actions.concat("playRandomNote");
            return {
                ...s,
                actions,
                score: 0,
                missedCount: s.missedCount + 1,
                comboCount: 0,
            };
        }

        // We hit at least one head; compute lane and clicked set
        const laneKey = cxToLaneKey(collidedCircles[0].cx);
        const clickedHeads = collidedCircles.map((c) => ({
            ...c,
            clicked: true,
        }));
        const userCircles = clickedHeads.filter(
            (c) => c.note?.user_played === true && c.clicked,
        );

        // Is any collided head tied to a tail?
        const collidedIds = new Set(collidedCircles.map((c) => c.id));
        const hasTail = s.tails.some((t) => collidedIds.has(t.id));

        // Start from a neutral next state that removes heads and records userCircles
        let next: State = {
            ...s,
            activeCircles: remainingCircles,
            expiredCircles: collidedCircles.concat(s.expiredCircles),
            userPlayCircles: userCircles,
            actions: s.actions.slice(),
        };

        if (hasTail) {
            // Long note: begin holding (no scoring yet)
            next = {
                ...next,
                holds: { ...s.holds, [laneKey]: true },
                actions: next.actions.concat(`startHold:${laneKey}`),
            };
            // Do NOT change score/combo/multiplier on head hit for long notes.
            return next;
        } else {
            // Short tap scoring (your original behavior)
            const scoreIncrement = collidedCircles.length * s.multiplier;
            const updatedScore = s.score + scoreIncrement;
            const highScore = Math.max(s.highScore, updatedScore);
            const comboCount = s.comboCount + 1;
            const multiplier = Math.min(
                initialState.multiplier + 0.25 * Math.floor(comboCount / 10),
                4,
            );
            return {
                ...next,
                score: updatedScore,
                highScore,
                comboCount,
                multiplier,
            };
        }
    }

    // getStatus will return true if the key is P, false if the key is R, and false if the key is N
    getStatus(): boolean {
        switch (this.e.code) {
            case "KeyP":
                return true;
            case "KeyR":
                return false;
            case "KeyN":
                return false;
            default:
                return false;
        }
    }

    // getStaticXandY will return the static x and y of the circle based on the key pressed
    getStaticXandY(): [string, number] {
        const staticY = Constants.CIRCLE_CY;
        switch (this.e.code) {
            case "KeyH":
                return [Constants.GREEN_CX, staticY];
            case "KeyJ":
                return [Constants.RED_CX, staticY];
            case "KeyK":
                return [Constants.BLUE_CX, staticY];
            case "KeyL":
                return [Constants.YELLOW_CX, staticY];
            // default case
            default:
                return ["0", 0];
        }
    }

    // pressCircle will handle the state update when the user press the key
    pressCircle = (s: State): State => {
        // Check if the circle is in the correct column, and collect the collided circles
        const collidedCircles = s.activeCircles.filter(
            this.circleBodyCollision,
        );

        // Update the collided circles to be clicked
        const updatedCircles = collidedCircles.map((circle) => ({
            ...circle, //contains all the properties of the circle, including the note
            clicked: true,
        }));

        // if user pressed when there is no collided circle, then add the action to playRandomNote
        const actions =
            collidedCircles.length === 0
                ? s.actions.concat("playRandomNote")
                : s.actions;

        // Filter out the collided circles from the active circles
        const remainingCircles = s.activeCircles.filter(
            not(this.circleBodyCollision),
        );

        // Filter out the collided circles that are user played and clicked
        // circle.note can be undefined
        const userCircles = updatedCircles.filter(
            (circle) =>
                circle.note?.user_played === true && circle.clicked === true,
        );

        // Calculate the score increment based on the number of collided circles
        const scoreIncrement = collidedCircles.length * s.multiplier;

        // if the game is not paused, then update the state
        if (s.paused === false) {
            return {
                ...s,
                score: s.score + scoreIncrement,
                highScore: Math.max(s.highScore, s.score + scoreIncrement),
                activeCircles: remainingCircles,
                expiredCircles: collidedCircles.concat(s.expiredCircles), // Add collided circles to expired
                userPlayCircles: userCircles,
                actions: actions,
            };
        }

        // if the game is paused, then return the old state
        else {
            return { ...s };
        }
    };

    // circleBodyCollision will check if the circle is in the correct column
    // This function is inspired by FRP Asteroids example
    // Mostly the bodyCollision part
    circleBodyCollision = (circle: circleBody): boolean => {
        // Get the static x and y of the circle based on the key pressed
        const [staticX, staticY] = this.getStaticXandY();

        // Define a tolerance margin
        // Adjust the tolerance margin to 1.25 times the radius so it is easier not to miss
        const toleranceMargin = Constants.RADIUS * 1.25;

        // Check if the circle is in the correct column
        if (staticX === circle.cx) {
            const yDistance = staticY - Number(circle.cy);
            return Math.abs(yDistance) <= toleranceMargin; // Updated tolerance calculation
        }

        // No collision happened
        return false;
    };
}

class ReleasedKey implements Action {
    constructor(public readonly e: KeyboardEvent) {}

    apply(s: State): State {
        const code = this.e.code;
        if (isPauseKey(code as Key)) return s; // ignore P/R on keyup
        if (!isLaneKey(code)) return s; // only lanes
        if (s.paused) return s;

        const holds = { ...s.holds, [code]: false };

        // If there's an active tail on this lane that isn't done, mark fail.
        const tails = s.tails.map((t) =>
            t.laneKey === code && t.status !== "done" && t.status !== "fail"
                ? { ...t, status: "fail" as "fail" }
                : t,
        );

        const actions = s.actions.concat(`stopHold:${code}`);

        return { ...s, holds, tails, actions };
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
