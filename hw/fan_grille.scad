// Parametric PC fan drilling template and cover grille.
// Standard fan sizes 40-140 mm, mounting hole spacing per fan spec.
// Render: F6, export STL. Customizer: Window > Customizer.

/* [Part] */
// template = drilling template, grille = cover grille, both = side by side
part = "both"; // [template, grille, both]

/* [Fan] */
fan_size = 120; // [40, 60, 80, 92, 120, 140, 0:custom]
// Used when fan_size = 0
custom_frame = 120;
custom_hole_spacing = 105;
custom_cutout_d = 116;

/* [Plate] */
// Extra border around fan frame (0 = same footprint as fan)
margin = 0;
corner_r = 5;
// Mounting hole diameter (4.3 for M4 / fan screws, 5.0 for self-tapping fan screws)
hole_d = 4.5;

/* [Grille] */
grille_thickness = 2.5;
pattern = "hex"; // [hex, rings, slots, round]
// Opening size (hex across flats, ring/slot width, round hole diameter)
opening = 8;
// Width of material between openings
bar = 1.6;
// Solid center disk over fan hub (0 = none)
hub_d = 0;
// Number of spokes for rings pattern
spokes = 4;
// Slot angle for slots pattern
slot_angle = 0;
countersink = true;
countersink_d = 8.5;

/* [Template] */
template_thickness = 3;
// Drill guide bushings height above plate (0 = flat template)
bushing_h = 6;
bushing_wall = 2.5;
// Center pilot hole (hole saw arbor drill)
pilot_d = 6.5;
// Width of the ring window for tracing the cutout circle
trace_w = 6;
trace_spoke_w = 6;
label = true;

/* [Hidden] */
$fn = 96;
eps = 0.01;

// [frame, hole spacing, cutout diameter]
function fan_dims(s) =
    s == 40  ? [40, 32, 38] :
    s == 60  ? [60, 50, 57] :
    s == 80  ? [80, 71.5, 76] :
    s == 92  ? [92, 82.5, 88] :
    s == 120 ? [120, 105, 116] :
    s == 140 ? [140, 124.5, 134] :
               [custom_frame, custom_hole_spacing, custom_cutout_d];

dims = fan_dims(fan_size);
frame = dims[0];
spacing = dims[1];
cut_d = dims[2];
plate = frame + 2 * margin;

assert(spacing < frame, "hole spacing must be smaller than frame");
assert(cut_d < plate, "cutout must fit into plate");

module rounded_square(size, r) {
    offset(r = r) square(size - 2 * r, center = true);
}

module hole_positions() {
    for (x = [-1, 1], y = [-1, 1])
        translate([x * spacing / 2, y * spacing / 2]) children();
}

// Grid of points covering the cutout, row offset for hexagonal packing
module hex_grid(pitch) {
    n = ceil(cut_d / pitch) + 1;
    row = pitch * sqrt(3) / 2;
    for (j = [-n : n], i = [-n : n])
        translate([i * pitch + (j % 2) * pitch / 2, j * row]) children();
}

module pattern_2d() {
    if (pattern == "hex") {
        hex_grid(opening + bar)
            rotate(30) circle(d = opening / cos(30), $fn = 6);
    } else if (pattern == "round") {
        hex_grid(opening + bar) circle(d = opening, $fn = 32);
    } else if (pattern == "slots") {
        pitch = opening + bar;
        n = ceil(cut_d / pitch);
        rotate(slot_angle)
            for (i = [-n : n])
                translate([i * pitch, 0]) square([opening, cut_d * 2], center = true);
    } else if (pattern == "rings") {
        pitch = opening + bar;
        r0 = max(hub_d / 2, bar);
        difference() {
            for (r = [r0 : pitch : cut_d / 2])
                difference() {
                    circle(r = r + opening);
                    circle(r = r);
                }
            for (a = [0 : 360 / max(spokes, 1) : 359])
                rotate(a) translate([0, -bar / 2]) square([cut_d, bar]);
        }
    }
}

module grille_openings_2d() {
    difference() {
        intersection() {
            circle(d = cut_d);
            pattern_2d();
        }
        if (hub_d > 0) circle(d = hub_d);
    }
}

module grille() {
    difference() {
        linear_extrude(grille_thickness)
            difference() {
                rounded_square(plate, corner_r);
                grille_openings_2d();
                hole_positions() circle(d = hole_d);
            }
        if (countersink)
            hole_positions()
                translate([0, 0, grille_thickness - (countersink_d - hole_d) / 2 + eps])
                    cylinder(d1 = hole_d, d2 = countersink_d, h = (countersink_d - hole_d) / 2);
    }
}

module template() {
    bush_d = hole_d + 2 * bushing_wall;
    difference() {
        union() {
            linear_extrude(template_thickness)
                difference() {
                    rounded_square(plate, corner_r);
                    // Ring window: trace its outer edge to mark the cutout circle.
                    // Spokes on the center lines keep the edge notches in solid material.
                    difference() {
                        circle(d = cut_d);
                        circle(d = cut_d - 2 * trace_w);
                        for (a = [0 : 90 : 359])
                            rotate(a) translate([0, -trace_spoke_w / 2]) square([cut_d, trace_spoke_w]);
                    }
                    // Center line notches on every edge
                    for (a = [0 : 90 : 359])
                        rotate(a) translate([plate / 2, 0]) rotate(45) square(3, center = true);
                }
            if (bushing_h > 0)
                hole_positions() cylinder(d = bush_d, h = template_thickness + bushing_h);
        }
        hole_positions() translate([0, 0, -eps]) cylinder(d = hole_d, h = 100);
        translate([0, 0, -eps]) cylinder(d = pilot_d, h = 100);
        // Cross hair on the pilot for alignment with marked center lines
        for (a = [0, 90])
            rotate(a) translate([0, 0, template_thickness - 0.6])
                linear_extrude(1) square([cut_d - 2 * trace_w - 4, 0.8], center = true);
        if (label)
            translate([0, -(cut_d / 2 - trace_w) / 2 - 4, template_thickness - 0.6])
                linear_extrude(1)
                    text(str(frame, " mm / ", spacing, " / D", cut_d), size = 4,
                         halign = "center", valign = "center");
    }
}

if (part == "template") {
    template();
} else if (part == "grille") {
    grille();
} else {
    translate([-(plate / 2 + 5), 0, 0]) template();
    translate([plate / 2 + 5, 0, 0]) grille();
}
