import {
    fromEvent,
    interval,
    merge,
    timer,
    Observable,
    of,
    from,
    BehaviorSubject,
    EMPTY,
  } from "rxjs";
  import { filter, map, scan, takeUntil, delay, mergeMap, switchMap, auditTime } from "rxjs/operators";
import { Constants, Key, State } from "./types";
import { parseCSV, show } from "./util";
import { CircleCreation, initialState, KeyPress, TailCreation, Tick } from "./state";

///////////////////////////////////////////////////////////////////////////////////////////////

// 50 ms interval
const tick$ = interval(Constants.TICK_RATE_MS);

// Observable for circle creation
const notesObs$ = (csvContents: string) => from(parseCSV(csvContents)).pipe(
    mergeMap((note) => of(note).pipe(
        filter(note => note.end - note.start <= 1),
        delay(note.start * 1000),
        map(note => new CircleCreation(note))
    ))
);

// Observable for long note creation
const longnotesObs$ = (csvContents: string) => from(parseCSV(csvContents)).pipe(
    mergeMap((note) => of(note).pipe(
        filter(note => note.user_played),
        filter(note => note.end - note.start > 1),
        delay(note.start * 1000),
        map(note => new TailCreation(note))
    ))
);

// Accumulate the elapsed time and emit a new Tick object
const gameClock$ = tick$.pipe(map(elapsed => new Tick(elapsed)));

// Hold the current state and emit it to subscribers
const currentState$ = new BehaviorSubject<State>(initialState);
const stateChanges$ = currentState$.asObservable();

// Create an observable that emits when all circles, tails, and exits are empty
const exitEmpty$ = stateChanges$.pipe(
    filter(state => 
        state.circleObjs.length === 0 
        && state.activeTails.length === 0
        && state.collidedTails.length === 0
        && state.exit.length === 0
        && state.bgexit.length === 0
        && state.tailexit.length === 0
    )
);

// One-time observable that emits when the game ends
const gameEnd$ = stateChanges$.pipe(
    filter((state: State) => state.gameEnd)
);

///////////////////////////////////////////////////////////////////////////////////////////////
export {
    tick$,
    notesObs$,
    longnotesObs$,
    gameClock$,
    currentState$,
    stateChanges$,
    exitEmpty$,
    gameEnd$
};