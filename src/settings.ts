import {Range} from "./lib/range.ts";

export const settings = {
    // "style"
    nEntities: 150, // fps tend to die if > 500
    size: new Range(0.005, 0.02, 1.0),
    length: new Range(8, 13),
    tapering: new Range(0.2, 0.25),

    // "personality"
    activeness: new Range(0.002, 0.01),
    strength: new Range(0.5, 1.0),

    // forces
    kSpring: 5,
    fMouse: 20000.0,
    fActive: 250.0,
    boundaryForce: 10000,
    boundaryThreshold: 0.1,

    // dampening
    aDamp: 4,
    vDamp: 2.0,

    // limits
    aMax: 5,
    vMin: 0.005,
    vMax: 1,

    // max time step size
    simMaxDt: 0.005,
}