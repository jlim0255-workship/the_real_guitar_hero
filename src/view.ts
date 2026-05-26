export { updateView, show, hide};
import {State, circleBody, Constants, Viewport, LaneKey} from './types';
// import {samples} from './main';
import {svg, gameover, RNG} from './util';
import * as Tone from "tone";

/** State processing */

// Keeps us from retriggering attack multiple times while holding the same lane
const holdingLanes = new Set<LaneKey>();

// Cache the last sustained note per lane so we can release it reliably
const laneLastNote: Record<LaneKey, { instrument_name: string; pitch: number; velocity: number } | null> = {
  KeyH: null, KeyJ: null, KeyK: null, KeyL: null
};


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


function renderTails(state: State) {
  // Clear previously drawn tails
  Array.from(svg.querySelectorAll(".tail")).forEach(n => n.remove());

  for (const t of state.tails) {
    // map lane -> cx%
    const cxPct =
      t.laneKey === "KeyH" ? Constants.GREEN_CX :
      t.laneKey === "KeyJ" ? Constants.RED_CX   :
      t.laneKey === "KeyK" ? Constants.BLUE_CX  : Constants.YELLOW_CX;

    const laneXPercent = Number(cxPct.replace("%", ""));
    const laneX = (laneXPercent / 100) * Viewport.CANVAS_WIDTH;

    // Convert ms to px using your fall speed (STEPSIZE per TICK)
    const tickMs = (Constants as any).TICK_RATE_MS ?? 10;
    const pxPerMs = Constants.STEPSIZE / tickMs;

    const totalPx  = t.totalMs * pxPerMs;
    const remainPx = t.remainingMs * pxPerMs;

    
    const yTop = Constants.CIRCLE_CY - totalPx;          // tail stretches upward from hit line
    const width = Constants.RADIUS * 4;
    const height = Math.max(0, remainPx);
    const x = laneX - width/2;

    const klass =
      t.status === "fail" ? "tail fail" :
      t.status === "holding" ? "tail held" : "tail";

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(yTop));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("class", klass);
    // svg.appendChild(rect);
    rect.setAttribute("pointer-events", "none"); // don’t block mouse/hover
    svg.insertBefore(rect, svg.firstChild);      // draw behind heads

  }
}

function handleAudioActions(state: State, samples: { [key: string]: Tone.Sampler }) {
  for (const a of state.actions) {
    if (a.startsWith("startHold:")) {
      const lane = a.split(":")[1] as LaneKey;

      // Don’t re-trigger while already sustaining this lane
      if (holdingLanes.has(lane)) continue;

      // Find an active tail on this lane (idle/holding)
      const t = state.tails.find(tt => tt.laneKey === lane && (tt.status === "idle" || tt.status === "holding"));
      const note = t?.note;
      if (!note) continue;

      const inst = samples[note.instrument_name];
      if (!inst) continue;

      try {
        // Attack (sustain)
        inst.triggerAttack(Tone.Frequency(note.pitch, "midi").toNote(), undefined, note.velocity / 127);
        holdingLanes.add(lane);
        laneLastNote[lane] = { instrument_name: note.instrument_name, pitch: note.pitch, velocity: note.velocity };
      } catch {}
    }

    if (a.startsWith("stopHold:")) {
      const lane = a.split(":")[1] as LaneKey;

      // Release using cached info (tail may already be removed from state)
      const last = laneLastNote[lane];
      if (last) {
        const inst = samples[last.instrument_name];
        if (inst) {
          try { inst.triggerRelease(Tone.Frequency(last.pitch, "midi").toNote()); } catch {}
        }
      }
      holdingLanes.delete(lane);
      laneLastNote[lane] = null;
    }
  }
}



/**
 * This function generates a random note based on the seed and plays it
 * This use of playing note is inspired by Week 4 applied class, 
 * from the: piano example and GPT
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
 * This function will update the svg view of the game
 * Including the sound effects for the background music and user played notes, circles, score, multiplier, high score, combo, and missed notes
 * This use of rendering game screen is inspired by the FRP Asteroids game example, similar to the updateView function
 * @param s the current state
 * @param samples the samples to play the notes
 * @returns void
 */
function updateView(s: State, samples: { [key: string]: Tone.Sampler }): void {

    // If the game is not paused, render the view with the current state
    // Including the sound effects for the background music and user played notes
    // circles, score, multiplier, high score, combo, and missed notes
    if (s.paused === false) {
        if (s.note) {
            // play the background music
            playNote(s, samples)
        }

        // If there are user played circles, play the notes for them
        if (s.userPlayCircles) {            
            s.userPlayCircles.forEach(circle => {
                if (circle.clicked) {
                    playNoteForCircle(s, circle, samples);
                    // Reset clicked to false after playing
                }
            });            
        }
        
        // If there are actions, perform them
        // This will play a random note if the action is "playRandomNote"
        if (s.actions) {            
            s.actions.forEach(action => {
            if (action === "playRandomNote") {
                playRandomNote(s.time, samples);
                }
            });
        }
        
        // Update the view for all active circles
        const updateBodyView = (circle: circleBody) => {
            function createCircleBodyView() {   
                
                // Create the SVG circle element
                // Set the attributes based on the circle properties
                const circleElement = createSvgElement(svg.namespaceURI, "circle", 
                    {
                        r: circle.r,
                        cx: circle.cx,
                        cy: circle.cy,
                        style: circle.style,
                        class: circle.class,
                        id: circle.id,
                        clicked: String(circle.clicked)
                    }
                );         
                // Append the circle to the SVG canvas               
                svg.appendChild(circleElement)

                // Return the circle element
                return circleElement;
            }
            
            // Create the circle element if it doesn't exist
            // If it does exist, update the cy attribute
            const circleElement = document.getElementById(circle.id) || createCircleBodyView();            
            circleElement.setAttribute("cy", circle.cy);            
        };        

        // Update the view for all active circles
        s.activeCircles.forEach(updateBodyView)

        // Update the view for all user played circles
        s.expiredCircles.forEach(circle => {

            // Get all the circles that are expired (passing the canvas border)
            const circleElement = document.getElementById(circle.id)
            
            // Remove the circle from the view
            if (circleElement){    
                svg.removeChild(circleElement)
            }            
            
        })

        // 👉 NEW: draw/update tails
        renderTails(s);

        // 👉 NEW: sustain/release audio for long notes
        handleAudioActions(s, samples);

        // Update the view for score
        const score = document.getElementById("scoreText")!
        score.textContent = String(s.score)
        
        // Update the view for multiplier
        const multiplier = document.getElementById("multiplierText")!
        multiplier.textContent = String(s.multiplier)

        // Update the view for high score
        const highScore = document.getElementById("highScoreText")!
        highScore.textContent = String(s.highScore)

        // Update the view for combo
        const currentCombo = document.getElementById("comboText")!
        currentCombo.textContent = String(s.comboCount)

        // Update the view for missed notes
        const missedNotes = document.getElementById("missedText")!
        missedNotes.textContent = String(s.missedCount)
        
    }
    
                                    
    // If the game is paused, not render the view


    

}
