const atan2Y = atan2(0.0, 1.0);
const atan2X = atan2(1.0, 0.0);

const LINE_WIDTH = 0.12;
const COLOR_FACTOR = 0.95;

struct Globals {
    segments: u32,
    vpMatrix: mat4x4<f32>,
}

struct EntityData {
    length: u32,
    color: vec3<f32>,
}

struct SegmentData {
    size: f32,
    position: vec2<f32>,
    velocity: vec2<f32>,
}

@group(0) @binding(0)
var<uniform> globals: Globals;

@group(0) @binding(1)
var<storage, read> entitiesData: array<EntityData>;

@group(0) @binding(2)
var<storage, read> segmentsData: array<SegmentData>;

struct VertOut {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) shouldDiscard: u32,
    @location(1) color: vec4<f32>,
}

@vertex
fn vertex_main(
    @builtin(instance_index) instanceIndex: u32,
    @location(0) position: vec4<f32>
) -> VertOut {
    var out : VertOut;

    // read gloals
    let segments = globals.segments;
    let vpMatrix = globals.vpMatrix;

    let entityIndex = instanceIndex / segments;
    let segmentIndex = instanceIndex % segments;
    let entityData = entitiesData[entityIndex];

    if (entityData.length - 1 <= segmentIndex) {
        out.shouldDiscard = 0; // value > 0 means discard
        return out;
    }

    let seg1 = segmentsData[instanceIndex];
    let seg2 = segmentsData[instanceIndex + 1];

    let width = seg2.size * LINE_WIDTH;

    let p1 = seg1.position;
    let p2 = seg2.position;

    let center = (p1 + p2) / 2;
    let dir = (p1 - p2) / 2;
    let radians = atan2(dir.y, dir.x) - atan2X;

    let dist = length(dir);
    let s1 = vec4<f32>(width, 0.0, 0.0, 0.0);
    let s2 = vec4<f32>(0.0, dist, 0.0, 0.0);
    let s3 = vec4<f32>(0.0, 0.0, 1.0, 0.0);
    let s4 = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    let sMatrix = mat4x4<f32>(s1, s2, s3, s4);

    let c1 = vec4<f32>( cos(radians), sin(radians), 0.0, 0.0);
    let c2 = vec4<f32>(-sin(radians), cos(radians), 0.0, 0.0);
    let c3 = vec4<f32>(0.0, 0.0, 1.0, 0.0);
    let c4 = vec4<f32>(center.x, center.y, 0.0, 1.0);
    let mMatrix = mat4x4<f32>(c1, c2, c3, c4);

    let m = vpMatrix * mMatrix * sMatrix;
    let local = position.xy;
    out.position = m * vec4(local, 0.0, 1.0);

    let kColor = 1.0 - f32(segmentIndex) / f32(segments - 1) / 2.0;
    out.color = vec4<f32>(entityData.color * kColor * COLOR_FACTOR, 1.0);
    return out;
}

@fragment
fn fragment_main(in: VertOut) -> @location(0) vec4<f32> {
    if (in.shouldDiscard < 0) { discard; }
    return in.color;
}