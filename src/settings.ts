import {Range} from "./lib/range.ts";

export const settings = {
    // "style"
    nEntities: 500, // fps tend to die if > 500
    size: new Range(0.01, 0.02, 2.0),
    length: new Range(5, 15),
    thickness: new Range(0.1, 0.5),

    // "personality"
    activeness: new Range(0.001, 0.005),
    strength: new Range(0.8, 1.0),

    // forces
    kSpring: 15,
    fMouse: 25.0,
    fActive: 1000.0,
    boundaryForce: 10000,
    boundaryThreshold: 0.1,

    // dampening
    aDamp: 3,
    vDamp: 1.0,

    // limits
    aMax: 10,
    vMin: 0.005,
    vMax: 1,

    // max time step size
    simMaxDt: 0.005,
}