export {not, readAndPasreCSV, showKeys, RNG, svg, preview, gameover, container,}

import { from, of, mergeMap, skip, delay, fromEvent, Observable} from "rxjs"
import { filter } from "rxjs/operators"
import { Key, Event, Note} from "./types"

/** Utility functions */
// This function is inspired by FRP Asteroids example in util.ts
// It is used to invert a boolean function
const not = <T>(f: (x: T) => boolean) => (x: T) => !f(x)

/**
 * Read and parse the CSV file into an Observable of notes
 * We will skip the header and parse the lines into notes
 * We will return the note as an observable with a delay
 * 
 * This function is inspired by the Week 3 Applied example: Print with delay
 * I used it to read and parse the CSV file into an Observable of notes
 * and delay the notes based on their start time
 * @param csvContents
 * @returns Observable of notes
 */
const readAndPasreCSV = (csvContents: string): Observable<Note> => {

    // Split the CSV file into lines
    const lines = csvContents.split("\n")

    // return an observable of notes
    return from(lines).pipe(

        // Skip the header
        skip(1),

        // Parse the lines into notes
        mergeMap(line => {
            // Destruct the line into the note properties
            const [user_played, instrument_name, velocity, pitch, start, end] = line.split(",")

            // Create a note object based on the properties
            const note = {
                user_played: user_played === "True",
                instrument_name,
                velocity: Number(velocity),
                pitch: Number(pitch),
                start: Number(start),
                end: Number(end)
            }
            
            // Return the note as an observable with a delay
            return of(note).pipe(delay(note.start * 1000)) // Convert seconds to milliseconds
        })
    )
}


// Canvas elements
const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
HTMLElement;

const preview = document.querySelector(
"#svgPreview",
) as SVGGraphicsElement & HTMLElement;

const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
HTMLElement;

const container = document.querySelector("#main") as HTMLElement;


/**
 * Show the keys on the screen, 
 * highlighting them when pressed,
 * and removing the highlight when released
 * 
 * This function is inspired by the Week 4 Applied example: Piano
 * and FRP Asteroids example's showKeys function
 * 
 * @returns void
 */
function showKeys() {
    function showKey(k: Key) {
        const userKey = document.getElementById(k)

        // getElement might be null, in this case return without doing anything
        if (!userKey) return

        // Check if the key is the same as the key pressed
        const o = (e: Event) => fromEvent<KeyboardEvent>(document, e).pipe(
            filter(({ code }) => code === k)
        )

        // Highlight the key when pressed
        o('keydown').subscribe(e => userKey.classList.add("highlight"))

        // Remove the highlight when released
        o('keyup').subscribe(_ => userKey.classList.remove("highlight"))
      }

    // Call the showKey function for each key in game controls
    showKey('KeyH');
    showKey('KeyJ');
    showKey('KeyK');
    showKey('KeyL');
    showKey('KeyP');
    showKey('KeyR');
}

/**
 * A random number generator which provides two pure functions
 * `hash` and `scaleToRange`.  Call `hash` repeatedly to generate the
 * sequence of hashes.
 * 
 * This class is inspired by the Week 4 Applied example: Monte Carlo pi approximation
 * We used the random number generator to generate random numbers for both x and y coordinates in the applied
 * Here, I used it to generate random numbers for playing random notes when user pressed the wrong key
 */
abstract class RNG {
    // LCG using GCC's constants
    private static m = 0x80000000; // 2**31
    private static a = 1103515245;
    private static c = 12345;

    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;

    /**
     * Takes hash value and scales it to the range [-1, 1]
     */
    public static scale = (hash: number) => (2 * hash) / (RNG.m - 1) - 1;

    // Helper functions to scale the hash value to the desired range
    /**
     * Scales the hash value to the desired range
     * @param seed
     * @param range
     * @returns scaled hash value
     */
    public static scaledHash = (seed: number, range: number) => Math.floor((RNG.hash(seed) / RNG.m) * range);

    /**
     * Scales the hash value to the desired float range
     * @param seed
     * @param min
     * @param max
     * @returns scaled hash value as float
     */
    public static scaledHashFloat = (seed: number, min: number, max: number) => {
        return min + (RNG.hash(seed) / RNG.m) * (max - min);
    }
}