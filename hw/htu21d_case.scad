// Parametric HTU21D (GY-21) sensor cap with magnet mount.
// Open back: wires go straight from the PCB header through a hole in the wall.
// Neodymium magnets in the flange hold the cap on sheet metal.
// Dimensions based on "Case for HTU21d PCB" by dustin_sn,
// https://www.thingiverse.com/thing:1760764 (CC BY-NC-SA); new geometry.
// Print orientation: flange down, no supports.

/* [PCB] */
pcb_w = 15.6;
pcb_l = 15.6;
pcb_t = 1.6;
// Clearance around PCB per side
pcb_clear = 0.2;
// Space above PCB for the sensor chip and parts
top_gap = 1.3;
// Space behind PCB for soldered wires bending into the wall
wire_space = 4;

/* [Shell] */
// Side wall and roof thickness (0.6 = 0.4 nozzle with Arachne, 0.8 = 2 perimeters)
wall = 0.6;
// Cavity corner radius, the PCB corners must fit (max ~ pcb_clear / 0.29)
inner_r = 0.5;
// Window above the sensor chip
window = 3.6;
// Window offset from PCB center, away from the header side (+Y = header)
window_offset = 3.5;
// Side vent slots for faster response
vents = true;
vent_w = 1.2;
vent_count = 3;

/* [PCB retention] */
// Corner ledges the PCB rests against (keeps chip off the roof)
ledge = 1.2;
// Snap bumps under the PCB (0 = none, PCB glued)
bump = 0.35;

/* [Magnets] */
magnets = 4; // [0, 2, 4]
magnet_d = 6;
magnet_h = 2;
// Diameter clearance for press fit (glue recommended)
magnet_clear = 0.2;
// Material around magnet pockets
magnet_wall = 1.2;
// Material above magnet pockets
magnet_skin = 0.6;

/* [Hidden] */
$fn = 64;
eps = 0.01;

cav_w = pcb_w + 2 * pcb_clear;
cav_l = pcb_l + 2 * pcb_clear;
cav_h = wire_space + pcb_t + top_gap;
body_w = cav_w + 2 * wall;
body_l = cav_l + 2 * wall;
body_h = cav_h + wall;
// Outer shape is the cavity offset by wall, so the shell is uniform everywhere
corner_r = inner_r + wall;
pocket_d = magnet_d + magnet_clear;
flange_h = magnets > 0 ? magnet_h + magnet_skin : 0;
// Magnet centers on the cavity diagonals, keeping magnet_wall to the cavity corner
mag_a = (pocket_d / 2 + magnet_wall) / sqrt(2) + 0.3;
mag_off = [cav_w / 2 + mag_a, cav_l / 2 + mag_a];
// Flange corners are concentric with the magnets
flange_r = pocket_d / 2 + magnet_wall;
flange_w = 2 * (mag_off[0] + flange_r);
flange_l = 2 * (mag_off[1] + flange_r);
pcb_z = wire_space;

assert(wall > 0 && inner_r > 0, "wall and inner_r must be positive");
assert(window / 2 + abs(window_offset) < cav_l / 2, "window outside cavity");

module rounded_rect(w, l, r) {
    offset(r = r) square([w - 2 * r, l - 2 * r], center = true);
}

// Box with corner radius r on vertical and top edges, flat bottom at z = 0
module rounded_box(w, l, h, r) {
    hull()
        for (x = [-1, 1], y = [-1, 1])
            translate([x * (w / 2 - r), y * (l / 2 - r), 0]) {
                cylinder(r = r, h = h - r);
                translate([0, 0, h - r]) sphere(r = r);
            }
}

module body() {
    rounded_box(body_w, body_l, body_h, corner_r);
}

module cavity() {
    translate([0, 0, -eps]) rounded_box(cav_w, cav_l, cav_h + eps, inner_r);
}

module flange() {
    linear_extrude(flange_h) rounded_rect(flange_w, flange_l, flange_r);
}

module magnet_positions() {
    pts = magnets == 4 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] :
          magnets == 2 ? [[-1, -1], [1, 1]] : [];
    for (p = pts) translate([p[0] * mag_off[0], p[1] * mag_off[1], 0]) children();
}

module retention() {
    // Corner ledges from PCB top surface up to the roof
    for (x = [-1, 1], y = [-1, 1])
        translate([x * (cav_w / 2 - ledge / 2), y * (cav_l / 2 - ledge / 2), pcb_z + pcb_t + cav_h / 2])
            cube([ledge, ledge, cav_h], center = true);
    // Snap bumps on both side walls just below the PCB
    if (bump > 0)
        for (x = [-1, 1])
            translate([x * cav_w / 2, 0, pcb_z - bump])
                rotate([90, 0, 0]) cylinder(r = bump, h = cav_l * 0.5, center = true, $fn = 16);
}

module case() {
    difference() {
        union() {
            body();
            if (magnets > 0) flange();
        }
        // Cavity, open at the back
        cavity();
        // Sensor window
        translate([0, -window_offset, cav_h - eps])
            linear_extrude(wall + 2) square(window, center = true);
        // Vent slots in the side walls next to the chip, above the PCB
        if (vents)
            for (x = [-1, 1], i = [0 : vent_count - 1])
                translate([x * (cav_w / 2 + wall / 2),
                           -window_offset + (i - (vent_count - 1) / 2) * (vent_w * 2.2),
                           pcb_z + pcb_t + top_gap / 2])
                    cube([wall + 2, vent_w, top_gap], center = true);
        // Magnet pockets, open to the wall
        magnet_positions() translate([0, 0, -eps]) cylinder(d = pocket_d, h = magnet_h + eps);
    }
    intersection() {
        retention();
        cavity();
    }
}

case();
