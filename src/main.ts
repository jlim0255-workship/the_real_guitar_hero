/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

/*
*Import the necessary libraries from rxjs and tone.js
*/
import "./style.css";

import { fromEvent, interval, merge, Subject, takeUntil, of, BehaviorSubject, timer, from} from "rxjs";
import { map, filter, scan, switchMap, debounceTime, withLatestFrom, take} from "rxjs/operators";
import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";
import { Key, State, Constants, Viewport, Note} from './types';
import { initialState, reduceState, PressedKey, ReleasedKey, Tick, CircleInfo, EndGameAction} from './state';
import { readAndPasreCSV, svg, showKeys, gameover} from './util';
import { updateView, show, hide} from "./view";

import { doc } from "prettier";

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main(csvContents: string, samples: { [key: string]: Tone.Sampler }) {    

    // Create the SVG canvas
    svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
    svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);

    /** User input */
    const fromKey = (keyCode: Key) =>
        fromEvent<KeyboardEvent>(document, "keydown").pipe(filter(({ code }) => code === keyCode));

    /** Determines the rate of time steps */
    const  tick$ = interval(Constants.TICK_RATE_MS);

    /**Handle User key input*/
    // This use of creating different streams for keyPress is inspired by Week 4 applied class, the moving rectangle exercise and FRP Asteroids example
    const keyH$ = fromKey("KeyH").pipe(map((e => new PressedKey(e))))
    const keyJ$ = fromKey("KeyJ").pipe(map((e => new PressedKey(e))))
    const keyK$ = fromKey("KeyK").pipe(map((e => new PressedKey(e))))
    const keyL$ = fromKey("KeyL").pipe(map((e => new PressedKey(e))))

    /**Pause and Resume */
    // This use of creating different streams for keyPress is inspired by Week 4 applied class, the moving rectangle exercise and FRP Asteroids example
    const keyP$ = fromKey("KeyP").pipe(map((e => new PressedKey(e))))
    const keyR$ = fromKey("KeyR").pipe(map((e => new PressedKey(e))))

    // NEW: keyup stream for releasing holds (long notes)
    const keyUp$ = fromEvent<KeyboardEvent>(document, "keyup").pipe(
    map(e => new ReleasedKey(e))
    );

    
    /**Reset feature */
    // This use of reset feature is inspired by Week 4 applied class: Monte Carlo pi approximation exercise
    // Get the reset button and create an observable from the click event
    // Must create a reset button with id in index.html first before this can work
    const resetButton = document.getElementById("resetButton") as HTMLButtonElement;

    // Reset the canvas by removing all circles except the static circles (green, red, blue, yellow circles) 
    // Must create the static circles with respective id in index.html first before this can work
    const resetCanvas = () => {
        svg.querySelectorAll("circle:not(#greenStaticCircle):not(#redStaticCircle):not(#blueStaticCircle):not(#yellowStaticCircle)")
        .forEach(circle => circle.remove());
    };

    // Reset the game when the reset button is clicked
    // Get the reset button and create an observable from the click event
    const reset$ = fromEvent(resetButton, "click");

    // When the reset button is clicked, reset the game
    const resetSubscription = reset$.subscribe(() => {
        // Unsubscribe from the game loop and reset the canvas
        gameLoop$.unsubscribe();

        // Reset the canvas
        resetCanvas();

        // Unsubscribe from the reset button
        resetSubscription.unsubscribe();

        // Call main again to restart the game
        main(csvContents, samples);
    });

    // This use of merging different stream, scan it and subscribe concept is inspired by FRP Asteroids game example:
    // Create observables for ticked, notes
    const ticked$ = tick$.pipe(map(value => new Tick(value)))

    // Read and parse the CSV file, then create an observable for each note
    const notes$ = readAndPasreCSV(csvContents).pipe(map((note: Note) => new CircleInfo(note)));

    // Observable to track the current state
    // inspired by ChatGPT.
    const currentState$ = new Subject<State>();

    // We using Subject so that we can manually emit the values using next()
    // once we emit the value, we check if the the game observable stops emitting value for 10 seconds
    // then check if the activeCircles are empty
    // if true, then we emit the value (new EndGameAction) to set the gameEnd to true
    // unsubscribe from the game loop and show the game over screen


    // Observable to track the game end
    const gameEnd$ = currentState$.pipe(

        // DebounceTime will wait for 10 seconds before emitting the last value
        debounceTime(10000),

        // Filter the state where activeCircles and userPlayCircles are empty
        filter((state: State) => state.activeCircles.length === 0),        

        // if both activeCircles and userPlayCircles are empty, then return gameEnd == true
        // which calls the EndGameAction
        map(() => (new EndGameAction()))
        
    )
    
    // Subscribe to the game end
    gameEnd$.subscribe(() => {
        show(gameover);
        gameLoop$.unsubscribe();
    });

    // Merge all the observables and scan the state reducing it and update the view
//     const gameLoop$ = merge(ticked$, notes$, keyH$, keyJ$, keyK$, keyL$, keyP$, keyR$)
//     .pipe(
//         scan((state, action) => {
            
//             // reduce the state
//             const newState = reduceState(state, action);          

//             // update the state to current state
//             currentState$.next(newState);
            
//             // return the new state
//             return newState;
//         }, initialState),

//         // once scan is done, take until the game ends
//         takeUntil(gameEnd$)
//     )
//     // subscribe to the game loop, update the view
//     .subscribe((s: State) => {

//         if (!s.gameEnd) {
//             hide(gameover);
//             updateView(s, samples);
//         }
//     }
// );

    const gameLoop$ = merge(
        ticked$,
        notes$,
        keyH$, keyJ$, keyK$, keyL$,
        keyP$, keyR$,
        keyUp$          // 👈 NEW
        )
        .pipe(
        scan((state, action) => {
            const newState = reduceState(state, action);
            currentState$.next(newState);
            return newState;
        }, initialState),
        takeUntil(gameEnd$)
        )
        .subscribe((s: State) => {
        if (!s.gameEnd) {
            hide(gameover);
            updateView(s, samples);
        }
        });

        
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: [
            "bass-electric",
            "violin",
            "piano",
            "trumpet",
            "saxophone",
            "trombone",
            "flute",
        ], // SampleLibrary.list,
        baseUrl: "samples/",
    });

    const startGame = (contents: string) => {
        document.body.addEventListener(
            "mousedown",
            function () {
                showKeys();
                main(contents, samples);
            },
            { once: true },
        );
    };

    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        fetch(`${baseUrl}/assets/${Constants.SONG_NAME}.csv`)
            .then((response) => response.text())
            .then((text) => startGame(text))
            .catch((error) =>
                console.error("Error fetching the CSV file:", error),
            );
        
    });
}