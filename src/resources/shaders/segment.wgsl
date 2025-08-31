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
    @location(2) offset: vec4<f32>,
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

    let length = entityData.length;
    out.shouldDiscard = length - segmentIndex;
    if (out.shouldDiscard < 0) {
        return out;
    }

    let segmentData = segmentsData[instanceIndex];
    let offset = segmentData.position;
    let velocity = segmentData.velocity;
    let radians = atan2(velocity.y, velocity.x); // - atan(0.0, 1.0) = 0;

    let c1 = vec4<f32>( cos(radians), sin(radians), 0.0, 0.0);
    let c2 = vec4<f32>(-sin(radians), cos(radians), 0.0, 0.0);
    let c3 = vec4<f32>(0.0, 0.0, 1.0, 0.0);
    let c4 = vec4<f32>(offset.x, offset.y, 0.0, 1.0);
    let mMatrix = mat4x4<f32>(c1, c2, c3, c4);

    let size = segmentData.size;

    let m = vpMatrix * mMatrix;
    let local = position.xy * size;
    out.position = m * vec4(local, 0.0, 1.0);
    out.offset = vec4(position.xy, 0.0, 1.0);

    let kColor = 1.0 - f32(segmentIndex) / f32(segments - 1) / 2.0;
    out.color = vec4<f32>(entityData.color * kColor, 1.0);
    return out;
}

@fragment
fn fragment_main(in: VertOut) -> @location(0) vec4<f32> {
    if (in.shouldDiscard < 0) { discard; }
    let shading = max(abs(in.offset.x), abs(in.offset.y));
    if (.6 < shading && shading < .8) { discard; }
    return in.color;
}