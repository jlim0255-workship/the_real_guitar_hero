export { initialState, reduceState, Tick, CircleData as CircleInfo, PressedKey, EndGameAction};
import { Action, State, Constants, circleBody, Note, Viewport} from './types';
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
    constructor(public readonly time: number) { }
    /** 
     * interval tick: circlebodies move, collisions happen, circles expire (out of the border)
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {

        // check if the circle has expired (out of the border)
        const expired = (circle : circleBody) => Number(circle.cy) > Viewport.CANVAS_HEIGHT

        // filter out the expired circles
        const expiredCircles = s.activeCircles.filter(expired)
        const activeCircles = s.activeCircles.filter(not(expired))

        // update the position of the active circles
        const updatedActiveCircles = activeCircles.map(circle => this.moveCircle(circle))

        //map the clicked of circle to false
        const updatedUserPlayCircles = s.userPlayCircles.filter(circle => !circle.clicked)
        
        //remove the actions playRandomNote in actions
        const actions = s.actions.filter(action => action !== "playRandomNote")

        // increment the missed count when the circle has expired (passing the border)
        const updatedMissedCount = s.missedCount + expiredCircles.length

        // reset the score if there is circle expired (passing the border)
        const updatedSocre = s.missedCount !== updatedMissedCount ? 0 : s.score

        // update the high score, if the updated score is greater than the high score
        // else keep the high score
        const updatedHighScore = Math.max(updatedSocre, s.highScore) 
        
        // if the game is not paused, then update the state
        if (s.paused === false) {            
            
            // return a new state with the updated active circles, expired circles, and missed count
            return {
                ...s,
                expiredCircles: expiredCircles.concat(s.expiredCircles),
                activeCircles: updatedActiveCircles,                
                userPlayCircles: updatedUserPlayCircles,
                note: s.note,
                time: this.time,
                actions: actions,
                missedCount: updatedMissedCount,  // increment the missed count when the circle has expired
                score: updatedSocre,  // Reset score if no hit
                highScore: updatedHighScore,
                comboCount: s.missedCount !== updatedMissedCount ? 0 : s.comboCount,  // Reset combo count if no hit
            }
        }

        // if the game is paused, then return the old state
        else {
            return {...s};
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
        cy: String(Number(circle.cy) + Constants.STEPSIZE)
    })

    
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
    createCircleData(note: Note ) : circleBody | undefined {        

        // assign the column and color based on the pitch
        const { column, color } = this.assign_column(note.pitch);

        // return the circle data with the properties
        return {
            r: `${Constants.RADIUS}`,
            cx: `${20 + column * 20}%`,
            cy: "0",
            style: `fill: ${color}`,
            class: "shadow",
            id: "",   // we will assign the id later when we add the circle to the activeCircles using the circleCount
            note: note,
            clicked: false
        };
        
    }

    /** 
     * create a circle for the note and add it to the activeCircles based on the note property
     * if the note is user played, then add the circle to the userPlayCircles
     * if the note is not user played, then add the circle to the activeCircles
     * @param s old State
     * @returns new State
     */
    apply(s: State): State {
        
        // create the circle for the note
        const circle = this.createCircleData(this.note);

        // if the game is not paused, then update the state
        if (s.paused === false) {

            // if the note is user played, then we will add the circle to the userPlayCircles
            if (this.note.user_played == true && circle !== undefined) {

                const userPlayCircle = {...circle, id: String(s.circleCount), note: this.note, clicked: false};
                
                // return a new state with the circle added to the userPlayCircles
                return {
                    ...s,
                    note: this.note,
                    activeCircles: s.activeCircles.concat(userPlayCircle),
                    circleCount: s.circleCount + 1
                }                                
            } 

            // else if the note is not user played, then we will add the circle to the activeCircles
            else {

                // return a new state with the circle added to the activeCircles
                return {
                    ...s,
                    note: this.note,
                    circleCount: s.circleCount + 1
                }
            }
        }

        // if the game is paused, then return the old state
        else {
            return {...s};
        }
        
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
    apply(s: State): State {
        
        // call the pressCircle function to check if the circle is in the correct column
        const updatedState = this.pressCircle(s);        

        // check if the user hit the circle
        const isHit = updatedState.userPlayCircles.length > 0 ? true : false;

        // increment the combo count if the user hit the circle
        // if the user miss the circle, then reset the combo count to 0
        const comboCount = isHit ? s.comboCount + 1 : 0; // Reset combo count if no hit        

        // increment the multiplier by 0.25 every 10 hits starting from the initial multiplier, here is 1
        // the multiplier will be capped at 4
        // Increase multiplier by 0.25 every 10 consecutive hits
        const multiplier = Math.min(initialState.multiplier + 0.25*Math.floor(comboCount / 10), 4); 
        
        // missed count (if the user press the key when there is no circle and also when the user miss the circle)                
        // wrpmgPress is the number of times user press the key when there is no circle
        const wrongPress = isHit ? s.missedCount : s.missedCount + 1;

        // increment the missed count if the user press the key when there is no circle
        const missedCount = wrongPress;

        // reset the score if the user miss the circle
        const updatedScore = isHit ? updatedState.score : 0;

        // updated paused state
        const updatedPaused = this.getStatus();
        
        //update the new state
        return {
            ...updatedState,
            score: updatedScore,
            paused: updatedPaused,
            multiplier,
            comboCount,  
            missedCount,                
        };
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
        const collidedCircles = s.activeCircles.filter(this.circleBodyCollision);
        
        // Update the collided circles to be clicked
        const updatedCircles = collidedCircles.map(circle => ({
            ...circle, //contains all the properties of the circle, including the note
            clicked: true
        }))

        // if user pressed when there is no collided circle, then add the action to playRandomNote
        const actions = collidedCircles.length === 0 ? s.actions.concat("playRandomNote") : s.actions;
        
        // Filter out the collided circles from the active circles
        const remainingCircles = s.activeCircles.filter(not(this.circleBodyCollision));        

        // Filter out the collided circles that are user played and clicked
        // circle.note can be undefined
        const userCircles = updatedCircles.filter(circle => circle.note?.user_played === true && circle.clicked === true);        

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
            return {...s};
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
            return Math.abs(yDistance) <= toleranceMargin;  // Updated tolerance calculation
        }

        // No collision happened
        return false;
    };        
    
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
