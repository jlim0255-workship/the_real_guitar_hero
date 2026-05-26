export { updateView, show, hide};
import {State, circleBody, tailBody, Constants, Viewport} from './types';
// import {samples} from './main';
import {svg, gameover, RNG} from './util';
import * as Tone from "tone";

/** State processing */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
    elem.setAttribute("visibility", "visible");
    elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
    elem.setAttribute("visibility", "hidden");


/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
) => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};


/**
 * Plays a note on the given instrument. The note is played after a delay
 * This function will play the background music of the game, which is the notes that are not user played
 * This use of playing note is inspired by Week 4 applied class, 
 * from the: piano example
 * @param s 
 * @param samples 
 * @returns void
 * 
 */
const playNote = (s: State, samples: {[key: string]: Tone.Sampler }): void => {

    // Check if there is a note to play
    const note = s.note!;

    // If the note is not user played, play the note
    if (note && note.user_played === false) {
        if (samples[note.instrument_name]) {

            // find the time duration for the note to travel from the top to the hit box
            const intervalsNum = Constants.CIRCLE_CY / Constants.STEPSIZE;
            // const duration = intervalsNum * Constants.IntervalDuration;
            const duration = intervalsNum * Constants.TICK_RATE_MS;
            
            // find the delay for the note to play
            const playbackDelay = (Constants.CIRCLE_CY / Viewport.CANVAS_HEIGHT) * duration;

            // Calculate the delay in milliseconds
            const delayInMilliseconds = playbackDelay;

            // Use setTimeout to schedule the note to play after the specified delay
            setTimeout(() => {
                samples[note.instrument_name].triggerAttackRelease(
                    Tone.Frequency(note.pitch, "midi").toNote(),
                    note.end - note.start,
                    undefined,
                    note.velocity / 127
                );
            }, delayInMilliseconds);                        
        }
    }
};



/**
 * This function generates a random note based on the seed and plays it
 * This use of playing note is inspired by Week 4 applied class, 
 * from the: piano example
 * 
 * @param seed The seed to generate the random note
 * @param samples The samples to play the notes
 * @returns void
 */
function playRandomNote(seed: number, samples: {[key: string]: Tone.Sampler }): void {

    // The instruments to choose from
    const instruments = ["bass-electric", "violin", "piano", "trumpet", "saxophone", "trombone", "flute"];    

    // the random instrument is between index 0 to 6
    const instrumentIndex = RNG.scaledHash(seed, instruments.length);    
    const instrument_name = instruments[instrumentIndex];

    // the random pitch is between 21 and 84
    const pitch = RNG.scaledHash(seed, 84 - 21 + 1) + 21;
    
    // the random duration is between 0 and 0.5
    const duration = RNG.scaledHashFloat(seed, 0, 0.5);

    // the random velocity is between
    const velocity = Constants.RANDOM_NOTE_VELOCITY;

    //play the note
    samples[instrument_name].triggerAttackRelease(
        Tone.Frequency(pitch, "midi").toNote(),
        duration,
        undefined, // Start time, leave as undefined for immediate start        
        velocity / 127
        );

}

/**
 * This function will handle the playing of the note for the user played circles (user_played === true)
 * This use of playing note is inspired by Week 4 applied class, 
 * from the: piano example
 * @param s The current state
 * @param circle The circle to play the note for
 * @param samples The samples to play the notes
 */
function playNoteForCircle(s: State, circle: circleBody, samples: { [key: string]: Tone.Sampler }) {    
        // Check if there is a note to play
        const note = circle.note!;

        // Play the note if it is user played
        if (samples[note.instrument_name] && note.user_played === true) {

            // Play the note
            samples[note.instrument_name].triggerAttackRelease(
                Tone.Frequency(note.pitch, "midi").toNote(),
                note.end - note.start,
                undefined,                
                note.velocity / 127
            );
        }
    
}


/**
 * Updates the position of a falling circle in the SVG canvas.
 * Creates the SVG element if it does not exist yet, otherwise updates cy.
 * This pattern (create-or-update) avoids recreating elements every tick.
 */
const updateCircleView = (circle: circleBody): void => {
    const existing = document.getElementById(circle.id)
    if (existing) {
        existing.setAttribute("cy", circle.cy)
    } else {
        const elem = createSvgElement(svg.namespaceURI, "circle", {
            r: circle.r,
            cx: circle.cx,
            cy: circle.cy,
            style: circle.style,
            class: circle.class,
            id: circle.id,
        })
        svg.appendChild(elem)
    }
}

/**
 * Updates the position of a falling tail rectangle in the SVG canvas.
 * Tails use a "tail_" prefix on their id to avoid clashing with their
 * parent circle which shares the same base id.
 * Creates the SVG rect if it does not exist, otherwise updates y.
 */
const updateTailView = (tail: tailBody): void => {
    const tailId = `tail_${tail.id}`
    const existing = document.getElementById(tailId)

    // x position: offset left by half the width so tail is centered on column
    // cx is a percentage string like "20%", convert to SVG units
    const cxPercent = parseFloat(tail.cx) / 100
    const x = String(cxPercent * Viewport.CANVAS_WIDTH - Number(tail.width) / 2)

    if (existing) {
        existing.setAttribute("y", tail.cy)
    } else {
        const elem = createSvgElement(svg.namespaceURI, "rect", {
            x,
            y: tail.cy,
            width: tail.width,
            height: tail.height,
            style: tail.style,
            class: tail.class,
            id: tailId,
        })
        svg.appendChild(elem)
    }
}

/**
 * Removes an SVG element from the canvas by id.
 * Safe to call even if the element does not exist.
 */
const removeFromSvg = (id: string): void => {
    const elem = document.getElementById(id)
    if (elem) svg.removeChild(elem)
}

/**
 * updateView is the only function that produces side effects (DOM + sound).
 * All game logic lives in state.ts - this function only reads state and renders it.
 * Inspired by the FRP Asteroids updateView pattern.
 * @param s the current state
 * @param samples the Tone.js sampler instruments
 */
function updateView(s: State, samples: { [key: string]: Tone.Sampler }): void {

    if (s.paused) return

    // play background notes (user_played === false)
    if (s.note) playNote(s, samples)

    // [FIX] sound trigger now uses expiredCircles instead of userPlayCircles
    // a circle in expiredCircles with clicked: true was just hit by the user
    s.expiredCircles
        .filter(circle => circle.clicked && circle.note?.user_played)
        .forEach(circle => playNoteForCircle(s, circle, samples))

    // play held tail notes: while a tail is held, keep triggering the note
    // Tone.js handles deduplication of attack calls on the same note
    s.activeTails
        .filter(tail => tail.held)
        .forEach(tail => {
            if (samples[tail.note.instrument_name]) {
                samples[tail.note.instrument_name].triggerAttack(
                    Tone.Frequency(tail.note.pitch, "midi").toNote(),
                    undefined,
                    tail.note.velocity / 127
                )
            }
        })

    // stop released tail notes: when held becomes false, trigger release
    s.expiredTails
        .filter(tail => !tail.held)
        .forEach(tail => {
            if (samples[tail.note.instrument_name]) {
                samples[tail.note.instrument_name].triggerRelease(
                    Tone.Frequency(tail.note.pitch, "midi").toNote()
                )
            }
        })

    // trigger random note on miss
    s.actions
        .filter(action => action === "playRandomNote")
        .forEach(() => playRandomNote(s.time, samples))

    // render all active circles (create or update cy)
    s.activeCircles.forEach(updateCircleView)

    // render all active tails (create or update y)
    s.activeTails.forEach(updateTailView)

    // remove expired circles from DOM
    s.expiredCircles.forEach(circle => removeFromSvg(circle.id))

    // remove expired tails from DOM
    s.expiredTails.forEach(tail => removeFromSvg(`tail_${tail.id}`))

    // update score display
    document.getElementById("scoreText")!.textContent = String(s.score)
    document.getElementById("multiplierText")!.textContent = String(s.multiplier)
    document.getElementById("highScoreText")!.textContent = String(s.highScore)
    document.getElementById("comboText")!.textContent = String(s.comboCount)
    document.getElementById("missedText")!.textContent = String(s.missedCount)
}